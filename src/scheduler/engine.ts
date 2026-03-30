/**
 * Scheduler Engine — the tick loop that claims and executes due jobs.
 * Modeled after AskSQL: 5-second tick, DB-tracked runs, timeout protection.
 */

import { db, sqlite } from "../db/index.js";
import { schedulerJobs, schedulerJobRuns, schedulerJobRunLogs } from "../db/schema-scheduler.js";
import { eq, sql } from "drizzle-orm";
import { getJob, getNextDailyRunTime } from "./registry.js";
import type { JobContext, JobResult } from "./types.js";

const TICK_INTERVAL_MS = 5000; // 5 seconds
let tickTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

/**
 * Start the scheduler engine tick loop.
 */
export function startEngine() {
  shuttingDown = false;

  // Clean up stale RUNNING jobs from previous crash/restart
  db.update(schedulerJobRuns)
    .set({
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Server restarted while job was running",
    })
    .where(eq(schedulerJobRuns.status, "RUNNING"))
    .run();

  tickTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      await tick();
    } catch (err) {
      console.error("[scheduler] Tick error:", (err as Error).message);
    }
  }, TICK_INTERVAL_MS);

  console.log("[scheduler] Engine started (5s tick loop)");
}

/**
 * Stop the scheduler engine.
 */
export function stopEngine() {
  shuttingDown = true;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  console.log("[scheduler] Engine stopped");
}

/**
 * Single tick — claim due jobs and execute them.
 */
async function tick() {
  const now = Date.now();

  // Find all due jobs: enabled, next_run_at <= now
  const dueJobs = db
    .select()
    .from(schedulerJobs)
    .where(
      sql`${schedulerJobs.isEnabled} = 'Y'
          AND ${schedulerJobs.nextRunAt} IS NOT NULL
          AND ${schedulerJobs.nextRunAt} <= ${now}`
    )
    .all();

  if (dueJobs.length === 0) return;

  // Claim jobs atomically: advance next_run_at and create RUNNING record
  // This prevents duplicate execution if the process crashes mid-tick
  const claimedJobs: Array<{ code: string; id: number; timeoutSeconds: number; jobRunId: number }> = [];

  for (const job of dueJobs) {
    const nextRun = job.dailyRunTime
      ? getNextDailyRunTime(job.dailyRunTime)
      : new Date(now + job.intervalSeconds * 1000);

    // Advance next_run_at
    db.update(schedulerJobs)
      .set({ nextRunAt: nextRun })
      .where(eq(schedulerJobs.id, job.id))
      .run();

    // Pre-create RUNNING record (so crash recovery can detect orphaned jobs)
    const runResult = db
      .insert(schedulerJobRuns)
      .values({
        jobId: job.id,
        jobCode: job.code,
        status: "RUNNING",
        startedAt: new Date(now),
        triggeredBy: "SCHEDULER",
      })
      .run() as unknown as { lastInsertRowid: number };

    claimedJobs.push({
      code: job.code,
      id: job.id,
      timeoutSeconds: job.timeoutSeconds,
      jobRunId: Number(runResult.lastInsertRowid),
    });
  }

  // Execute jobs sequentially to avoid API rate limits and DB contention
  for (const job of claimedJobs) {
    await executeClaimedJob(job.code, job.id, job.timeoutSeconds, job.jobRunId, "SCHEDULER");
  }
}

/**
 * Execute a claimed job (run record already created) with timeout protection.
 */
async function executeClaimedJob(
  jobCode: string,
  jobId: number,
  timeoutSeconds: number,
  jobRunId: number,
  triggeredBy: string
): Promise<void> {
  const registered = getJob(jobCode);
  if (!registered) {
    console.error(`[scheduler] Job ${jobCode} not found in registry`);
    db.update(schedulerJobRuns)
      .set({ status: "FAILED", completedAt: new Date(), errorMessage: "Job not found in registry" })
      .where(eq(schedulerJobRuns.id, jobRunId))
      .run();
    return;
  }

  const startedAt = Date.now();

  const ctx: JobContext = {
    jobRunId,
    jobCode,
    data: {},
    log: (level, message) => {
      db.insert(schedulerJobRunLogs)
        .values({ jobRunId, level, message, loggedAt: new Date() })
        .run();
    },
  };

  try {
    const result = await Promise.race<JobResult>([
      registered.execute(ctx),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Job timed out after ${timeoutSeconds}s`)),
          timeoutSeconds * 1000
        )
      ),
    ]);

    const durationMs = Date.now() - startedAt;
    db.update(schedulerJobRuns)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        durationMs,
        recordsProcessed: result.recordsProcessed,
        outputMessage: result.outputMessage,
      })
      .where(eq(schedulerJobRuns.id, jobRunId))
      .run();
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = (err as Error).message;
    const isTimeout = errorMsg.includes("timed out");

    db.update(schedulerJobRuns)
      .set({
        status: isTimeout ? "TIMED_OUT" : "FAILED",
        completedAt: new Date(),
        durationMs,
        errorMessage: errorMsg,
      })
      .where(eq(schedulerJobRuns.id, jobRunId))
      .run();

    console.error(`[scheduler] Job ${jobCode} ${isTimeout ? "TIMED_OUT" : "FAILED"}: ${errorMsg}`);
  }
}

/**
 * Execute a single job with timeout protection and full logging.
 * Creates its own RUNNING record (used by manual triggers).
 */
async function executeJob(
  jobCode: string,
  jobId: number,
  timeoutSeconds: number,
  triggeredBy: string = "SCHEDULER"
): Promise<void> {
  const runResult = db
    .insert(schedulerJobRuns)
    .values({
      jobId,
      jobCode,
      status: "RUNNING",
      startedAt: new Date(),
      triggeredBy,
    })
    .run() as unknown as { lastInsertRowid: number };

  await executeClaimedJob(jobCode, jobId, timeoutSeconds, Number(runResult.lastInsertRowid), triggeredBy);
}

/**
 * Manually trigger a job — creates a RUNNING record immediately,
 * then executes in the background.
 */
export function triggerJob(jobCode: string) {
  const job = db
    .select()
    .from(schedulerJobs)
    .where(eq(schedulerJobs.code, jobCode))
    .get();

  if (!job) {
    console.error(`[scheduler] Cannot trigger unknown job: ${jobCode}`);
    return;
  }

  console.log(`[scheduler] Job ${jobCode} triggered manually`);

  // Set nextRunAt to the proper next time (daily fixed time or interval-based)
  const nextRun = job.dailyRunTime
    ? getNextDailyRunTime(job.dailyRunTime)
    : new Date(Date.now() + job.intervalSeconds * 1000);
  db.update(schedulerJobs)
    .set({ nextRunAt: nextRun })
    .where(eq(schedulerJobs.code, jobCode))
    .run();

  // Execute immediately in the background
  executeJob(jobCode, job.id, job.timeoutSeconds, "MANUAL").catch((err) => {
    console.error(`[scheduler] Manual trigger of ${jobCode} failed:`, err);
  });
}
