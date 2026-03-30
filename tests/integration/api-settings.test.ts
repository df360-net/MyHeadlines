import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

import { Hono } from "hono";
import { settingsRoutes } from "../../src/routes/settings.js";

function createApp() {
  const app = new Hono();
  app.route("/api/settings", settingsRoutes);
  return app;
}

describe("GET /api/settings", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty object when no settings exist", async () => {
    const app = createApp();
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({});
  });

  it("returns all config key-value pairs", async () => {
    testSqlite.prepare(`INSERT INTO config (key, value) VALUES (?, ?)`).run("email", "user@test.com");
    testSqlite.prepare(`INSERT INTO config (key, value) VALUES (?, ?)`).run("timezone", "America/New_York");

    const app = createApp();
    const res = await app.request("/api/settings");
    const data = await res.json();
    expect(data.email).toBe("user@test.com");
    expect(data.timezone).toBe("America/New_York");
  });
});

describe("PUT /api/settings", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("creates new settings", async () => {
    const app = createApp();
    const res = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", phone: "+15551234567" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify in DB
    const email = testSqlite.prepare(`SELECT value FROM config WHERE key = 'email'`).get() as any;
    const phone = testSqlite.prepare(`SELECT value FROM config WHERE key = 'phone'`).get() as any;
    expect(email.value).toBe("new@test.com");
    expect(phone.value).toBe("+15551234567");
  });

  it("updates existing settings via upsert", async () => {
    testSqlite.prepare(`INSERT INTO config (key, value) VALUES (?, ?)`).run("email", "old@test.com");

    const app = createApp();
    await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "updated@test.com" }),
    });

    const row = testSqlite.prepare(`SELECT value FROM config WHERE key = 'email'`).get() as any;
    expect(row.value).toBe("updated@test.com");
  });

  it("handles multiple allowed keys in one request", async () => {
    const app = createApp();
    await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", phone: "+1555", timezone: "UTC" }),
    });

    const count = testSqlite.prepare(`SELECT COUNT(*) as c FROM config`).get() as { c: number };
    expect(count.c).toBe(3);
  });

  it("rejects unknown keys", async () => {
    const app = createApp();
    const res = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unknown_key: "val" }),
    });

    const data = await res.json();
    expect(data.rejected).toContain("unknown_key");

    const count = testSqlite.prepare(`SELECT COUNT(*) as c FROM config`).get() as { c: number };
    expect(count.c).toBe(0);
  });
});
