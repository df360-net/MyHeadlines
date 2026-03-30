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
    return testSqlite.prepare(`SELECT id, slug, display_name as displayName FROM topics WHERE id = ?`).get(id) as any;
  },
  getFixedTopics: () => {
    return testSqlite.prepare(`SELECT id, slug, display_name as displayName, sort_order as sortOrder FROM topics WHERE is_fixed = 1 ORDER BY sort_order`).all();
  },
  getDisplayOrder: (_id: number) => 999,
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

describe("GET /api/headlines/categories", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns empty categories when no data exists", async () => {
    const app = createApp();
    const res = await app.request("/api/headlines/categories");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fixedCategories).toEqual([]);
    expect(data.categories).toEqual([]);
  });

  it("returns fixed categories with headline counts", async () => {
    const politicsId = seedTopic(testSqlite, "politics", "Politics", true);
    const sportsId = seedTopic(testSqlite, "sports", "Sports", true);

    insertHeadline("h1", "Political News 1", politicsId);
    insertHeadline("h2", "Political News 2", politicsId);
    insertHeadline("h3", "Sports News", sportsId);

    const app = createApp();
    const res = await app.request("/api/headlines/categories");
    const data = await res.json();

    expect(data.fixedCategories).toHaveLength(2);
    const politics = data.fixedCategories.find((c: any) => c.name === "politics");
    const sports = data.fixedCategories.find((c: any) => c.name === "sports");
    expect(politics.count).toBe(2);
    expect(sports.count).toBe(1);
  });

  it("returns personal interest categories separately from fixed", async () => {
    const politicsId = seedTopic(testSqlite, "politics", "Politics", true);
    const aiId = seedTopic(testSqlite, "artificial-intelligence", "Artificial Intelligence", false);

    insertHeadline("h1", "Politics", politicsId);
    insertHeadline("h2", "AI News", aiId);

    // Add user interest in AI
    testSqlite.prepare(
      `INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("i1", aiId, "artificial-intelligence", 0.8, 0.5, "click", 5, Date.now());

    const app = createApp();
    const res = await app.request("/api/headlines/categories");
    const data = await res.json();

    expect(data.fixedCategories).toHaveLength(1);
    expect(data.fixedCategories[0].name).toBe("politics");

    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].name).toBe("artificial-intelligence");
    expect(data.categories[0].isInterest).toBe(true);
  });

  it("does not duplicate fixed topics in personal categories", async () => {
    const politicsId = seedTopic(testSqlite, "politics", "Politics", true);
    insertHeadline("h1", "Politics 1", politicsId);

    // Even if user has interest in politics, it shouldn't appear in personal categories
    testSqlite.prepare(
      `INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("i1", politicsId, "politics", 0.9, 0.8, "click", 10, Date.now());

    const app = createApp();
    const res = await app.request("/api/headlines/categories");
    const data = await res.json();

    expect(data.fixedCategories).toHaveLength(1);
    expect(data.categories).toHaveLength(0); // politics excluded from personal
  });

  it("backfills categories from RSS when user has fewer than 10 interests", async () => {
    const techId = seedTopic(testSqlite, "technology", "Technology", false);
    insertHeadline("h1", "Tech News", techId);

    // No user interests — should backfill from RSS category counts
    const app = createApp();
    const res = await app.request("/api/headlines/categories");
    const data = await res.json();

    expect(data.categories.length).toBeGreaterThanOrEqual(1);
    expect(data.categories[0].name).toBe("technology");
    expect(data.categories[0].isInterest).toBe(false);
  });
});
