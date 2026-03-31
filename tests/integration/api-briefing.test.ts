import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";
import type { DailyBriefing } from "../../src/services/ai/briefing.js";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

let cached: DailyBriefing | null = null;

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/services/ai/briefing.js", () => ({
  getCachedBriefing: () => cached,
}));

vi.mock("../../src/services/topics/index.js", () => ({
  getDisplayOrder: (_id: number) => _id,
  getInterestWeights: () => new Map(),
}));

import { Hono } from "hono";
import { briefingRoutes } from "../../src/routes/briefing.js";

function createApp() {
  const app = new Hono();
  app.route("/api/briefing", briefingRoutes);
  return app;
}

const mockBriefing: DailyBriefing = {
  date: new Date().toISOString().slice(0, 10),
  categories: [
    {
      categoryId: 1,
      category: "Technology",
      headlines: [{ title: "AI Breakthrough", url: "https://example.com/ai", summary: "Big AI news." }],
    },
    {
      categoryId: 2,
      category: "Sports",
      headlines: [{ title: "Game Results", url: "https://example.com/game", summary: "Final scores." }],
    },
  ],
  generatedAt: new Date().toISOString(),
};

describe("GET /api/briefing", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
    cached = null;
  });

  it("returns empty message when no briefing is cached", async () => {
    const app = createApp();
    const res = await app.request("/api/briefing");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.empty).toBe(true);
    expect(data.message).toContain("4:30 PM");
  });

  it("returns cached briefing", async () => {
    cached = mockBriefing;
    const app = createApp();
    const res = await app.request("/api/briefing");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].category).toBe("Technology");
  });

  it("sorts categories by display order", async () => {
    cached = {
      ...mockBriefing,
      categories: [
        { categoryId: 10, category: "Z-Category", headlines: [{ title: "Z", url: "https://z.com", summary: "z" }] },
        { categoryId: 1, category: "A-Category", headlines: [{ title: "A", url: "https://a.com", summary: "a" }] },
      ],
    };

    const app = createApp();
    const res = await app.request("/api/briefing");
    const data = await res.json();
    expect(data.categories[0].categoryId).toBe(1);
    expect(data.categories[1].categoryId).toBe(10);
  });
});
