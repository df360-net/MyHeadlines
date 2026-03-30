import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/services/delivery/index.js", () => ({
  sendDailyDigest: vi.fn().mockResolvedValue({ email: true, headlineCount: 5 }),
}));

import { Hono } from "hono";
import { digestRoutes } from "../../src/routes/digest.js";

function createApp() {
  const app = new Hono();
  app.route("/api/digest", digestRoutes);
  return app;
}

describe("GET /api/digest/history", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty list when no digests have been sent", async () => {
    const app = createApp();
    const res = await app.request("/api/digest/history");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.digests).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("returns past digests ordered by sentAt desc", async () => {
    const now = Date.now();
    testSqlite.prepare(`INSERT INTO digest_sends (id, headline_ids, channel, sent_at) VALUES (?, ?, ?, ?)`).run(
      "d1", '["h1","h2"]', "email", now - 86400000
    );
    testSqlite.prepare(`INSERT INTO digest_sends (id, headline_ids, channel, sent_at) VALUES (?, ?, ?, ?)`).run(
      "d2", '["h3","h4"]', "email", now
    );

    const app = createApp();
    const res = await app.request("/api/digest/history");
    const data = await res.json();

    expect(data.digests).toHaveLength(2);
    expect(data.total).toBe(2);
    // Most recent first
    expect(data.digests[0].id).toBe("d2");
  });
});

describe("POST /api/digest/send", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("triggers digest send and returns result", async () => {
    const app = createApp();
    const res = await app.request("/api/digest/send", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe(true);
    expect(data.headlineCount).toBe(5);
  });
});
