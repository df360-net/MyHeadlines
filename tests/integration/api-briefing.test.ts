import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";
import type { DailyBriefing } from "../../src/services/ai/briefing.js";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

const { mockBriefing, generateFn, cacheFns } = vi.hoisted(() => {
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

  const generateFn = vi.fn().mockResolvedValue(mockBriefing);

  let cached: DailyBriefing | null = null;
  const cacheFns = {
    getCachedBriefing: vi.fn(() => cached),
    saveBriefing: vi.fn((b: DailyBriefing) => { cached = b; }),
    _setCached: (b: DailyBriefing | null) => { cached = b; },
  };

  return { mockBriefing, generateFn, cacheFns };
});

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

vi.mock("../../src/services/ai/briefing.js", async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    generateDailyBriefing: generateFn,
  };
});

vi.mock("../../src/services/ai/briefing-cache.js", () => cacheFns);

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

describe("GET /api/briefing", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
    cacheFns._setCached(null);
    generateFn.mockClear();
  });

  it("generates briefing when no cache exists", async () => {
    const app = createApp();
    const res = await app.request("/api/briefing");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].category).toBe("Technology");
    expect(generateFn).toHaveBeenCalledOnce();
  });

  it("returns cached briefing without regenerating", async () => {
    cacheFns._setCached(mockBriefing);
    const app = createApp();
    const res = await app.request("/api/briefing");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.categories).toHaveLength(2);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("regenerates when refresh=true", async () => {
    cacheFns._setCached(mockBriefing);
    const app = createApp();
    const res = await app.request("/api/briefing?refresh=true");
    expect(res.status).toBe(200);
    expect(generateFn).toHaveBeenCalledOnce();
  });

  it("returns 500 on generation error", async () => {
    generateFn.mockRejectedValueOnce(new Error("AI not configured"));
    const app = createApp();
    const res = await app.request("/api/briefing");
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to generate briefing. Check your AI provider configuration.");
  });

  it("sorts categories by display order", async () => {
    const reversed: DailyBriefing = {
      ...mockBriefing,
      categories: [
        { categoryId: 10, category: "Z-Category", headlines: [{ title: "Z", url: "https://z.com", summary: "z" }] },
        { categoryId: 1, category: "A-Category", headlines: [{ title: "A", url: "https://a.com", summary: "a" }] },
      ],
    };
    generateFn.mockResolvedValueOnce(reversed);

    const app = createApp();
    const res = await app.request("/api/briefing");
    const data = await res.json();
    expect(data.categories[0].categoryId).toBe(1);
    expect(data.categories[1].categoryId).toBe(10);
  });
});
