import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

import { getCachedBriefing, saveBriefing } from "../../src/services/ai/briefing-cache.js";
import type { DailyBriefing } from "../../src/services/ai/briefing.js";

describe("briefing cache", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  const today = new Date().toISOString().slice(0, 10);

  const sampleBriefing: DailyBriefing = {
    date: today,
    categories: [
      {
        categoryId: 1,
        category: "Technology",
        headlines: [{ title: "AI News", url: "https://example.com/ai", summary: "Big AI story." }],
      },
    ],
    generatedAt: new Date().toISOString(),
  };

  it("returns null when no briefing is cached", () => {
    expect(getCachedBriefing()).toBeNull();
  });

  it("saves and retrieves today's briefing", () => {
    saveBriefing(sampleBriefing);
    const cached = getCachedBriefing();
    expect(cached).not.toBeNull();
    expect(cached!.date).toBe(today);
    expect(cached!.categories).toHaveLength(1);
    expect(cached!.categories[0].category).toBe("Technology");
  });

  it("returns null for stale (different day) briefing", () => {
    const yesterday: DailyBriefing = {
      ...sampleBriefing,
      date: "2020-01-01",
    };
    saveBriefing(yesterday);
    expect(getCachedBriefing()).toBeNull();
  });

  it("overwrites previous briefing on re-save", () => {
    saveBriefing(sampleBriefing);

    const updated: DailyBriefing = {
      ...sampleBriefing,
      categories: [
        ...sampleBriefing.categories,
        { categoryId: 2, category: "Sports", headlines: [{ title: "Game", url: "https://example.com/game", summary: "Score." }] },
      ],
    };
    saveBriefing(updated);

    const cached = getCachedBriefing();
    expect(cached!.categories).toHaveLength(2);
  });

  it("returns null for corrupted JSON in DB", () => {
    testSqlite.prepare(`INSERT INTO config (key, value) VALUES ('daily_briefing', 'not-json')`).run();
    expect(getCachedBriefing()).toBeNull();
  });
});
