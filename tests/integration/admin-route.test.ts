import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/db/migrate.js", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("../../src/scheduler/registry.js", () => ({
  syncJobsToDb: vi.fn(),
}));

import { Hono } from "hono";
import { adminRoutes } from "../../src/routes/admin.js";

function createApp() {
  const app = new Hono();
  app.route("/api/admin", adminRoutes);
  return app;
}

describe("POST /api/admin/reset", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("allows reset from localhost", async () => {
    // Insert some data
    testSqlite.prepare("INSERT INTO config (key, value) VALUES ('test', 'data')").run();

    const app = createApp();
    const res = await app.request("/api/admin/reset", {
      method: "POST",
      headers: { host: "localhost:3456" },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("allows reset from 127.0.0.1", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/reset", {
      method: "POST",
      headers: { host: "127.0.0.1:3456" },
    });

    expect(res.status).toBe(200);
  });

  it("rejects reset from non-localhost", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/reset", {
      method: "POST",
      headers: { host: "evil.com" },
    });

    expect(res.status).toBe(403);
  });
});
