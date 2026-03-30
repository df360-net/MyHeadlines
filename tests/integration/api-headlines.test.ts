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
  getOrCreateTopicId: (slug: string) => {
    const row = testSqlite.prepare(`SELECT id FROM topics WHERE slug = ?`).get(slug) as { id: number } | undefined;
    if (row) return row.id;
    testSqlite.prepare(`INSERT INTO topics (slug, display_name, is_fixed, sort_order) VALUES (?, ?, 0, 999)`).run(slug, slug);
    return (testSqlite.prepare(`SELECT id FROM topics WHERE slug = ?`).get(slug) as { id: number }).id;
  },
  getTopicById: (id: number) => {
    return testSqlite.prepare(`SELECT id, slug, display_name as displayName FROM topics WHERE id = ?`).get(id);
  },
  getFixedTopics: () => {
    return testSqlite.prepare(`SELECT id, slug, display_name as displayName, sort_order as sortOrder FROM topics WHERE is_fixed = 1 ORDER BY sort_order`).all();
  },
  getDisplayOrder: () => 999,
  getInterestWeights: () => new Map(),
}));

import { Hono } from "hono";
import { headlinesRoutes } from "../../src/routes/headlines.js";

function createApp() {
  const app = new Hono();
  app.route("/api/headlines", headlinesRoutes);
  return app;
}

function insertHeadline(id: string, title: string, topicId: number | null, fetchedAt = Date.now()) {
  testSqlite.prepare(
    `INSERT INTO headlines (id, title, url, topics, topic_ids, category_id, fetched_at, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, `https://example.com/${id}`, "[]", topicId ? JSON.stringify([topicId]) : "[]", topicId, fetchedAt, 0.5);
}

describe("GET /api/headlines", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty list when no headlines exist", async () => {
    const app = createApp();
    const res = await app.request("/api/headlines");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.headlines).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("returns headlines with default pagination", async () => {
    const tid = seedTopic(testSqlite, "tech");
    for (let i = 0; i < 5; i++) {
      insertHeadline(`h${i}`, `Headline ${i}`, tid);
    }

    const app = createApp();
    const res = await app.request("/api/headlines");
    const data = await res.json();
    expect(data.headlines).toHaveLength(5);
    expect(data.total).toBe(5);
  });

  it("respects limit and offset params", async () => {
    const tid = seedTopic(testSqlite, "tech");
    for (let i = 0; i < 10; i++) {
      insertHeadline(`h${i}`, `Headline ${i}`, tid);
    }

    const app = createApp();
    const res = await app.request("/api/headlines?limit=3&offset=2");
    const data = await res.json();
    expect(data.headlines).toHaveLength(3);
    expect(data.offset).toBe(2);
    expect(data.limit).toBe(3);
    expect(data.total).toBe(10);
  });

  it("filters by topicId", async () => {
    const techId = seedTopic(testSqlite, "technology");
    const sportsId = seedTopic(testSqlite, "sports");
    insertHeadline("h1", "Tech News", techId);
    insertHeadline("h2", "Sports News", sportsId);

    const app = createApp();
    const res = await app.request(`/api/headlines?topicId=${techId}`);
    const data = await res.json();
    expect(data.headlines).toHaveLength(1);
    expect(data.headlines[0].title).toBe("Tech News");
  });
});

describe("POST /api/headlines/:id/feedback", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("records feedback on a headline", async () => {
    const tid = seedTopic(testSqlite, "tech");
    insertHeadline("h1", "Tech News", tid);

    const app = createApp();
    const res = await app.request("/api/headlines/h1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "up" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify feedback stored in DB
    const row = testSqlite.prepare(`SELECT feedback FROM headlines WHERE id = ?`).get("h1") as any;
    expect(row.feedback).toBe("up");
  });

  it("clears feedback when set to none", async () => {
    const tid = seedTopic(testSqlite, "tech");
    insertHeadline("h1", "Tech News", tid);
    testSqlite.prepare(`UPDATE headlines SET feedback = 'up' WHERE id = 'h1'`).run();

    const app = createApp();
    await app.request("/api/headlines/h1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "none" }),
    });

    const row = testSqlite.prepare(`SELECT feedback FROM headlines WHERE id = ?`).get("h1") as any;
    expect(row.feedback).toBeNull();
  });
});
