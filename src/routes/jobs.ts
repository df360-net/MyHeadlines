import { Hono } from "hono";
import { db } from "../db/index.js";
import { schedulerJobs, schedulerJobRuns } from "../db/schema-scheduler.js";
import { desc, eq, sql } from "drizzle-orm";
import { triggerJob } from "../scheduler/index.js";

export const jobsRoutes = new Hono();

// GET /api/jobs — list all jobs with status
jobsRoutes.get("/", (c) => {
  const jobs = db.select().from(schedulerJobs).all();

  // Get the latest run for each job
  const jobsWithStatus = jobs.map((job) => {
    const lastRun = db
      .select()
      .from(schedulerJobRuns)
      .where(eq(schedulerJobRuns.jobCode, job.code))
      .orderBy(desc(schedulerJobRuns.startedAt))
      .limit(1)
      .get();

    return {
      ...job,
      lastRun: lastRun || null,
    };
  });

  return c.json({ jobs: jobsWithStatus });
});

// GET /api/jobs/:code/runs — execution history for a job
jobsRoutes.get("/:code/runs", (c) => {
  const { code } = c.req.param();
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "20") || 20));

  const runs = db
    .select()
    .from(schedulerJobRuns)
    .where(eq(schedulerJobRuns.jobCode, code))
    .orderBy(desc(schedulerJobRuns.startedAt))
    .limit(limit)
    .all();

  return c.json({ runs });
});

// POST /api/jobs/:code/trigger — manually trigger a job
jobsRoutes.post("/:code/trigger", (c) => {
  const { code } = c.req.param();

  const job = db
    .select()
    .from(schedulerJobs)
    .where(eq(schedulerJobs.code, code))
    .get();

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  triggerJob(code);

  return c.json({ ok: true, message: `Job ${code} triggered` });
});

// PUT /api/jobs/:code — update job settings (interval, enabled)
jobsRoutes.put("/:code", async (c) => {
  const { code } = c.req.param();
  const body = await c.req.json<{
    intervalSeconds?: number;
    isEnabled?: string;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.intervalSeconds !== undefined) updates.intervalSeconds = body.intervalSeconds;
  if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;

  db.update(schedulerJobs)
    .set(updates)
    .where(eq(schedulerJobs.code, code))
    .run();

  return c.json({ ok: true });
});
