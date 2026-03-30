import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/scheduler/index.js", () => ({
  triggerJob: vi.fn(),
}));

import { Hono } from "hono";
import { jobsRoutes } from "../../src/routes/jobs.js";
import { triggerJob } from "../../src/scheduler/index.js";

function createApp() {
  const app = new Hono();
  app.route("/api/jobs", jobsRoutes);
  return app;
}

function insertJob(code: string, name: string, intervalSeconds = 3600) {
  testSqlite.prepare(
    `INSERT INTO scheduler_jobs (code, name, group_code, interval_seconds, is_enabled)
     VALUES (?, ?, 'GENERAL', ?, 'Y')`
  ).run(code, name, intervalSeconds);
}

function insertJobRun(jobCode: string, status: string, startedAt = Date.now()) {
  const job = testSqlite.prepare(`SELECT id FROM scheduler_jobs WHERE code = ?`).get(jobCode) as { id: number };
  testSqlite.prepare(
    `INSERT INTO scheduler_job_runs (job_id, job_code, status, started_at, triggered_by)
     VALUES (?, ?, ?, ?, 'SCHEDULER')`
  ).run(job.id, jobCode, status, startedAt);
}

describe("GET /api/jobs", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty jobs list", async () => {
    const app = createApp();
    const res = await app.request("/api/jobs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toEqual([]);
  });

  it("returns jobs with their latest run status", async () => {
    insertJob("fetch_news", "Fetch News");
    insertJob("send_digest", "Send Digest");

    const now = Date.now();
    insertJobRun("fetch_news", "COMPLETED", now - 3600000);
    insertJobRun("fetch_news", "COMPLETED", now); // latest

    const app = createApp();
    const res = await app.request("/api/jobs");
    const data = await res.json();

    expect(data.jobs).toHaveLength(2);
    const fetchJob = data.jobs.find((j: any) => j.code === "fetch_news");
    expect(fetchJob.lastRun).not.toBeNull();
    expect(fetchJob.lastRun.status).toBe("COMPLETED");

    const digestJob = data.jobs.find((j: any) => j.code === "send_digest");
    expect(digestJob.lastRun).toBeNull();
  });
});

describe("GET /api/jobs/:code/runs", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns run history for a job", async () => {
    insertJob("fetch_news", "Fetch News");
    const now = Date.now();
    insertJobRun("fetch_news", "COMPLETED", now - 7200000);
    insertJobRun("fetch_news", "FAILED", now - 3600000);
    insertJobRun("fetch_news", "COMPLETED", now);

    const app = createApp();
    const res = await app.request("/api/jobs/fetch_news/runs");
    const data = await res.json();

    expect(data.runs).toHaveLength(3);
    // Most recent first
    expect(data.runs[0].status).toBe("COMPLETED");
    expect(data.runs[1].status).toBe("FAILED");
  });

  it("returns empty runs for job with no history", async () => {
    insertJob("new_job", "New Job");
    const app = createApp();
    const res = await app.request("/api/jobs/new_job/runs");
    const data = await res.json();
    expect(data.runs).toEqual([]);
  });

  it("respects limit parameter", async () => {
    insertJob("busy_job", "Busy Job");
    for (let i = 0; i < 10; i++) {
      insertJobRun("busy_job", "COMPLETED", Date.now() - i * 1000);
    }

    const app = createApp();
    const res = await app.request("/api/jobs/busy_job/runs?limit=3");
    const data = await res.json();
    expect(data.runs).toHaveLength(3);
  });
});

describe("POST /api/jobs/:code/trigger", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
    vi.mocked(triggerJob).mockClear();
  });

  it("triggers an existing job", async () => {
    insertJob("fetch_news", "Fetch News");
    const app = createApp();
    const res = await app.request("/api/jobs/fetch_news/trigger", { method: "POST" });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(triggerJob).toHaveBeenCalledWith("fetch_news");
  });

  it("returns 404 for non-existent job", async () => {
    const app = createApp();
    const res = await app.request("/api/jobs/nonexistent/trigger", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/jobs/:code", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("updates job interval", async () => {
    insertJob("fetch_news", "Fetch News", 3600);
    const app = createApp();
    const res = await app.request("/api/jobs/fetch_news", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervalSeconds: 1800 }),
    });

    expect(res.status).toBe(200);
    const row = testSqlite.prepare(`SELECT interval_seconds FROM scheduler_jobs WHERE code = 'fetch_news'`).get() as any;
    expect(row.interval_seconds).toBe(1800);
  });

  it("disables a job", async () => {
    insertJob("fetch_news", "Fetch News");
    const app = createApp();
    await app.request("/api/jobs/fetch_news", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: "N" }),
    });

    const row = testSqlite.prepare(`SELECT is_enabled FROM scheduler_jobs WHERE code = 'fetch_news'`).get() as any;
    expect(row.is_enabled).toBe("N");
  });
});
