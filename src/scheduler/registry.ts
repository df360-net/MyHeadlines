/**
 * Job Registry — registers jobs in code and syncs to DB at startup.
 * Admin can change intervals/enable/disable via DB without restarting.
 */

import { db } from "../db/index.js";
import { schedulerJobs } from "../db/schema-scheduler.js";
import { config } from "../db/schema.js";
import { eq, notInArray, sql } from "drizzle-orm";
import type { RegisteredJob, JobMeta, JobFn, JobContext, JobResult } from "./types.js";

export interface ClusteredJobStep {
  name: string;
  execute: JobFn;
  /** If true, continue to next step even if this one fails. Default: false (stop on failure). */
  continueOnFailure?: boolean;
}

const registry = new Map<string, RegisteredJob>();

/**
 * Register a job in the in-memory registry.
 */
export function registerJob(meta: JobMeta, execute: JobFn) {
  registry.set(meta.code, { meta, execute });
}

/**
 * Get a registered job by code.
 */
export function getJob(code: string): RegisteredJob | undefined {
  return registry.get(code);
}

/**
 * Get all registered jobs.
 */
export function getAllJobs(): RegisteredJob[] {
  return Array.from(registry.values());
}

/**
 * Register a clustered job — a named job that runs a sequence of child steps.
 * Appears as a single job in the scheduler UI. Each step runs in order.
 */
export function registerClusteredJob(meta: JobMeta, steps: ClusteredJobStep[]) {
  const execute: JobFn = async (ctx: JobContext): Promise<JobResult> => {
    let totalRecords = 0;
    const messages: string[] = [];

    for (const step of steps) {
      ctx.log("INFO", `[${step.name}] Starting...`);
      try {
        const result = await step.execute(ctx);
        totalRecords += result.recordsProcessed;
        messages.push(`${step.name}: ${result.outputMessage}`);
        ctx.log("INFO", `[${step.name}] Done — ${result.outputMessage}`);
      } catch (err) {
        const msg = (err as Error).message;
        ctx.log("ERROR", `[${step.name}] Failed — ${msg}`);
        if (!step.continueOnFailure) {
          throw new Error(`Step "${step.name}" failed: ${msg}`);
        }
        messages.push(`${step.name}: FAILED — ${msg}`);
      }
    }

    return {
      recordsProcessed: totalRecords,
      outputMessage: messages.join(" | "),
    };
  };

  registerJob(meta, execute);
}

/**
 * Sync registered jobs to the database.
 * - New jobs get inserted with defaults.
 * - Existing jobs keep their admin-overridden values (interval, enabled, next_run_at).
 * - Only name/description/group get updated.
 */
export function syncJobsToDb() {
  const now = Date.now();

  for (const [code, job] of registry) {
    const existing = db
      .select()
      .from(schedulerJobs)
      .where(eq(schedulerJobs.code, code))
      .get();

    const dailyRunTime = job.meta.defaultDailyRunTime || null;

    if (existing) {
      // Update metadata — preserve admin overrides for interval/enabled
      // Always recalculate nextRunAt for daily jobs to pick up timezone fixes
      const updates: Record<string, unknown> = {
        name: job.meta.name,
        description: job.meta.description,
        groupCode: job.meta.groupCode,
        dailyRunTime,
        updatedAt: new Date(now),
      };
      if (dailyRunTime) {
        updates.nextRunAt = getNextDailyRunTime(dailyRunTime);
      }
      db.update(schedulerJobs)
        .set(updates)
        .where(eq(schedulerJobs.code, code))
        .run();
    } else {
      // New job — insert with defaults
      const nextRun = dailyRunTime
        ? getNextDailyRunTime(dailyRunTime)
        : new Date(now); // interval-based: run immediately

      db.insert(schedulerJobs)
        .values({
          code,
          name: job.meta.name,
          description: job.meta.description,
          groupCode: job.meta.groupCode,
          intervalSeconds: job.meta.defaultIntervalSeconds,
          timeoutSeconds: job.meta.defaultTimeoutSeconds,
          dailyRunTime,
          isEnabled: "Y",
          nextRunAt: nextRun,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .run();
    }
  }

  // Remove jobs no longer in the registry
  const registeredCodes = Array.from(registry.keys());
  if (registeredCodes.length > 0) {
    db.delete(schedulerJobs)
      .where(notInArray(schedulerJobs.code, registeredCodes))
      .run();
  }

  console.log(`[scheduler] ${registry.size} jobs synced to database`);
}

/**
 * Get the user's timezone from the config table.
 */
export function getUserTimezone(): string {
  const row = db.select().from(config).where(eq(config.key, "timezone")).get();
  return row?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Calculate the next occurrence of a daily run time (HH:MM) in the user's local timezone.
 * If today's run time hasn't passed yet, returns today at HH:MM.
 * Otherwise, returns tomorrow at HH:MM.
 *
 * Uses Intl.DateTimeFormat for reliable timezone offset calculation
 * instead of the lossy toLocaleString() round-trip.
 */
export function getNextDailyRunTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const tz = getUserTimezone();

  // Get the current time parts in both UTC and user's timezone
  const now = new Date();
  const utcParts = getDatePartsInTz(now, "UTC");
  const localParts = getDatePartsInTz(now, tz);

  // Use Date.UTC to build timestamps — avoids system timezone interference
  const targetLocalMs = Date.UTC(
    localParts.year, localParts.month - 1, localParts.day,
    hours, minutes, 0, 0
  );
  const nowLocalMs = Date.UTC(
    localParts.year, localParts.month - 1, localParts.day,
    localParts.hour, localParts.minute, localParts.second, 0
  );

  // If target already passed today (in user's local time), move to tomorrow
  let targetMs = targetLocalMs;
  if (targetMs <= nowLocalMs) {
    targetMs += 24 * 60 * 60 * 1000;
  }

  // Calculate user timezone offset from UTC (positive = east of UTC)
  const utcNowMs = Date.UTC(
    utcParts.year, utcParts.month - 1, utcParts.day,
    utcParts.hour, utcParts.minute, utcParts.second, 0
  );
  const offsetMs = nowLocalMs - utcNowMs;

  // Convert from user's local time to UTC
  return new Date(targetMs - offsetMs);
}

/** Extract date parts in a given timezone using Intl.DateTimeFormat. */
function getDatePartsInTz(date: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === 24 ? 0 : get("hour"), // midnight edge case
    minute: get("minute"),
    second: get("second"),
  };
}
