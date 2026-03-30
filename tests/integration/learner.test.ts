import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedTopic } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

// We need to mock the DB module before importing learner
let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

// Mock topics service to use our test DB
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
}));

import { processClick, processNegativeFeedback } from "../../src/services/interests/learner.js";

describe("processClick", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("creates new interest when topic has no existing interest", () => {
    const topicId = seedTopic(testSqlite, "artificial-intelligence");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "AI Headline", "https://example.com/ai", "[]", JSON.stringify([topicId]), Date.now()
    );

    processClick("h1", "web");

    const interest = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(topicId) as any;
    expect(interest).toBeTruthy();
    expect(interest.raw_weight).toBe(0.5); // initial weight for new click-created interest
    expect(interest.interaction_count).toBe(1);
    expect(interest.source).toBe("click");
  });

  it("strengthens existing interest with EMA formula", () => {
    const topicId = seedTopic(testSqlite, "technology");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "Tech News", "https://example.com/tech", "[]", JSON.stringify([topicId]), Date.now()
    );
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", topicId, "technology", 0.4, 0.3, "bookmark", 2, Date.now() - 86400000
    );

    processClick("h1", "web");

    const interest = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(topicId) as any;
    // EMA: newWeight = 0.3 * 1.0 + 0.7 * 0.4 = 0.58
    expect(interest.raw_weight).toBeCloseTo(0.58, 5);
    expect(interest.confidence).toBeCloseTo(0.35, 5); // 0.3 + 0.05
    expect(interest.interaction_count).toBe(3);
  });

  it("handles multiple topics in one headline", () => {
    const tid1 = seedTopic(testSqlite, "ai");
    const tid2 = seedTopic(testSqlite, "robotics");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "AI Robots", "https://example.com/ai-robots", "[]", JSON.stringify([tid1, tid2]), Date.now()
    );

    processClick("h1", "web");

    const i1 = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(tid1);
    const i2 = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(tid2);
    expect(i1).toBeTruthy();
    expect(i2).toBeTruthy();
  });

  it("does nothing for non-existent headline", () => {
    processClick("non-existent", "web");
    const count = testSqlite.prepare(`SELECT COUNT(*) as c FROM user_interests`).get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("caps confidence at 1.0", () => {
    const topicId = seedTopic(testSqlite, "tech");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "Tech", "https://example.com/tech", "[]", JSON.stringify([topicId]), Date.now()
    );
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", topicId, "tech", 0.9, 0.98, "click", 50, Date.now()
    );

    processClick("h1", "web");

    const interest = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(topicId) as any;
    expect(interest.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe("processNegativeFeedback", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("weakens existing interest weight", () => {
    const topicId = seedTopic(testSqlite, "sports");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "Sports News", "https://example.com/sports", "[]", JSON.stringify([topicId]), Date.now()
    );
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", topicId, "sports", 0.8, 0.5, "bookmark", 5, Date.now()
    );

    processNegativeFeedback("h1");

    const interest = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(topicId) as any;
    // EMA: newWeight = 0.05 * 0.0 + 0.95 * 0.8 = 0.76
    expect(interest.raw_weight).toBeCloseTo(0.76, 5);
  });

  it("does not create new interest for unknown topic", () => {
    const topicId = seedTopic(testSqlite, "unknown");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "Unknown", "https://example.com/unknown", "[]", JSON.stringify([topicId]), Date.now()
    );

    processNegativeFeedback("h1");

    const count = testSqlite.prepare(`SELECT COUNT(*) as c FROM user_interests`).get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("clamps weight to 0 (never negative)", () => {
    const topicId = seedTopic(testSqlite, "spam");
    testSqlite.prepare(`INSERT INTO headlines (id, title, url, topics, topic_ids, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      "h1", "Spam", "https://example.com/spam", "[]", JSON.stringify([topicId]), Date.now()
    );
    testSqlite.prepare(`INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "i1", topicId, "spam", 0.01, 0.1, "click", 1, Date.now()
    );

    processNegativeFeedback("h1");

    const interest = testSqlite.prepare(`SELECT * FROM user_interests WHERE topic_id = ?`).get(topicId) as any;
    expect(interest.raw_weight).toBeGreaterThanOrEqual(0);
  });
});
