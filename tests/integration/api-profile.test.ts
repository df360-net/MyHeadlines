import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedTopic } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/services/topics/index.js", () => ({
  getTopicById: (id: number) => {
    return testSqlite.prepare(`SELECT id, slug, display_name as displayName FROM topics WHERE id = ?`).get(id) as any;
  },
}));

import { Hono } from "hono";
import { profileRoutes } from "../../src/routes/profile.js";

function createApp() {
  const app = new Hono();
  app.route("/api/profile", profileRoutes);
  return app;
}

describe("GET /api/profile", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty interests list", async () => {
    const app = createApp();
    const res = await app.request("/api/profile");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.interests).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("returns interests sorted by decayed weight", async () => {
    const tid1 = seedTopic(testSqlite, "ai");
    const tid2 = seedTopic(testSqlite, "sports");

    const now = Date.now();
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", tid1, "ai", 0.9, 0.8, "click", 10, now
    );
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i2", tid2, "sports", 0.3, 0.2, "bookmark", 2, now
    );

    const app = createApp();
    const res = await app.request("/api/profile");
    const data = await res.json();

    expect(data.interests).toHaveLength(2);
    // Higher weight first
    expect(data.interests[0].weight).toBeGreaterThan(data.interests[1].weight);
  });
});

describe("POST /api/profile/topics/:topicId", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("increases weight with 'more' action", async () => {
    const tid = seedTopic(testSqlite, "technology");
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", tid, "technology", 0.5, 0.5, "click", 5, Date.now()
    );

    const app = createApp();
    const res = await app.request(`/api/profile/topics/${tid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "more" }),
    });

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.newWeight).toBeCloseTo(0.7, 5); // 0.5 + 0.2
  });

  it("decreases weight with 'less' action", async () => {
    const tid = seedTopic(testSqlite, "politics");
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", tid, "politics", 0.6, 0.5, "click", 3, Date.now()
    );

    const app = createApp();
    const res = await app.request(`/api/profile/topics/${tid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "less" }),
    });

    const data = await res.json();
    expect(data.newWeight).toBeCloseTo(0.4, 5); // 0.6 - 0.2
  });

  it("sets weight to 0 with 'block' action", async () => {
    const tid = seedTopic(testSqlite, "entertainment");
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", tid, "entertainment", 0.8, 0.7, "click", 10, Date.now()
    );

    const app = createApp();
    const res = await app.request(`/api/profile/topics/${tid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "block" }),
    });

    const data = await res.json();
    expect(data.newWeight).toBe(0);
  });

  it("returns 404 for non-existent topic", async () => {
    const app = createApp();
    const res = await app.request("/api/profile/topics/9999", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "more" }),
    });

    expect(res.status).toBe(404);
  });

  it("clamps 'more' at 1.0 max", async () => {
    const tid = seedTopic(testSqlite, "ai");
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", tid, "ai", 0.95, 0.9, "click", 20, Date.now()
    );

    const app = createApp();
    const res = await app.request(`/api/profile/topics/${tid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "more" }),
    });

    const data = await res.json();
    expect(data.newWeight).toBeLessThanOrEqual(1.0);
  });
});
