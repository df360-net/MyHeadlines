import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedTopic } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

import {
  getOrCreateTopicId,
  getTopicById,
  getFixedTopics,
  getAllTopics,
  getTopicMap,
  resolveSlug,
  getDisplayOrder,
  getInterestWeights,
} from "../../src/services/topics/index.js";

describe("topic service", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  describe("getOrCreateTopicId", () => {
    it("creates a new topic and returns its ID", () => {
      const id = getOrCreateTopicId("artificial-intelligence");
      expect(id).toBeGreaterThan(0);

      const topic = testSqlite.prepare("SELECT * FROM topics WHERE id = ?").get(id) as any;
      expect(topic.slug).toBe("artificial-intelligence");
      expect(topic.display_name).toBe("Artificial Intelligence");
    });

    it("returns existing topic ID without duplicating", () => {
      const id1 = getOrCreateTopicId("technology");
      const id2 = getOrCreateTopicId("technology");
      expect(id1).toBe(id2);
    });

    it("normalizes slug to lowercase", () => {
      const id1 = getOrCreateTopicId("Technology");
      const id2 = getOrCreateTopicId("TECHNOLOGY");
      expect(id1).toBe(id2);
    });

    it("throws on empty slug", () => {
      expect(() => getOrCreateTopicId("")).toThrow("empty");
    });

    it("accepts custom display name", () => {
      const id = getOrCreateTopicId("ai", "Artificial Intelligence");
      const topic = testSqlite.prepare("SELECT display_name FROM topics WHERE id = ?").get(id) as any;
      expect(topic.display_name).toBe("Artificial Intelligence");
    });
  });

  describe("getTopicById", () => {
    it("returns topic by ID", () => {
      const id = seedTopic(testSqlite, "sports", "Sports");
      const topic = getTopicById(id);
      expect(topic).not.toBeNull();
      expect(topic!.slug).toBe("sports");
    });

    it("returns null for non-existent ID", () => {
      expect(getTopicById(99999)).toBeNull();
    });
  });

  describe("resolveSlug", () => {
    it("resolves existing slug to ID", () => {
      const id = seedTopic(testSqlite, "finance");
      expect(resolveSlug("finance")).toBe(id);
    });

    it("returns null for unknown slug", () => {
      expect(resolveSlug("nonexistent")).toBeNull();
    });
  });

  describe("getFixedTopics", () => {
    it("returns only fixed topics sorted by order", () => {
      seedTopic(testSqlite, "politics", "Politics", true);
      seedTopic(testSqlite, "sports", "Sports", true);
      seedTopic(testSqlite, "ai", "AI", false);

      const fixed = getFixedTopics();
      expect(fixed).toHaveLength(2);
      expect(fixed.every((t) => t.isFixed === 1)).toBe(true);
    });
  });

  describe("getTopicMap", () => {
    it("returns map of all topics keyed by ID", () => {
      const id1 = seedTopic(testSqlite, "tech");
      const id2 = seedTopic(testSqlite, "sports");

      const map = getTopicMap();
      expect(map.size).toBe(2);
      expect(map.get(id1)?.slug).toBe("tech");
      expect(map.get(id2)?.slug).toBe("sports");
    });
  });

  describe("getDisplayOrder", () => {
    it("returns sortOrder for fixed topics", () => {
      testSqlite.prepare("INSERT INTO topics (slug, display_name, is_fixed, sort_order) VALUES (?, ?, 1, 3)").run("politics", "Politics");
      const id = (testSqlite.prepare("SELECT id FROM topics WHERE slug = 'politics'").get() as any).id;
      expect(getDisplayOrder(id)).toBe(3);
    });

    it("returns 999 for unknown topics", () => {
      expect(getDisplayOrder(99999)).toBe(999);
    });

    it("returns interest-based order for non-fixed topics", () => {
      const id = seedTopic(testSqlite, "ai");
      testSqlite.prepare(
        "INSERT INTO user_interests (id, topic_id, topic, raw_weight, confidence, source, interaction_count, last_interaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run("i1", id, "ai", 0.8, 0.5, "click", 5, Date.now());

      const order = getDisplayOrder(id);
      expect(order).toBeLessThan(999);
      expect(order).toBe(400 - 80); // 400 - (0.8 * 100)
    });
  });
});
