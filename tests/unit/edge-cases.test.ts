import { describe, it, expect, vi } from "vitest";

// Mock topics for scorer and parseTopicIds
vi.mock("../../src/services/topics/index.js", () => ({
  getOrCreateTopicId: (slug: string) => slug.length,
}));

import { scoreHeadline, type InterestWeight, type HeadlineToScore } from "../../src/services/interests/scorer.js";
import { normalizeTitle, normalizeUrl, deduplicateHeadlines } from "../../src/services/news/deduplicator.js";
import { makeRawHeadline } from "../fixtures/headlines.js";

describe("scorer edge cases", () => {
  const now = Date.now();
  const emptyRecent = new Map<number, number>();

  function makeHeadline(overrides: Partial<HeadlineToScore> = {}): HeadlineToScore {
    return {
      id: "h1",
      topicIds: null,
      topics: "[]",
      sourceName: null,
      fetchedAt: new Date(now),
      ...overrides,
    };
  }

  it("handles headline with no topicIds and no legacy topics", () => {
    const interests = new Map<number, InterestWeight>();
    const score = scoreHeadline(makeHeadline(), interests, now, emptyRecent);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("handles unknown source name (defaults to 0.5 quality)", () => {
    const interests = new Map<number, InterestWeight>();
    const score = scoreHeadline(makeHeadline({ sourceName: null }), interests, now, emptyRecent);
    expect(Number.isNaN(score)).toBe(false);
  });

  it("handles very old headline without producing NaN", () => {
    const interests = new Map<number, InterestWeight>([
      [1, { topicId: 1, decayedWeight: 0.5, confidence: 0.5 }],
    ]);
    const score = scoreHeadline(
      makeHeadline({ topicIds: "[1]", fetchedAt: new Date(0) }), // epoch
      interests, now, emptyRecent
    );
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("score never exceeds 1.0 even with perfect inputs", () => {
    const interests = new Map<number, InterestWeight>([
      [1, { topicId: 1, decayedWeight: 1.0, confidence: 1.0 }],
      [2, { topicId: 2, decayedWeight: 1.0, confidence: 1.0 }],
      [3, { topicId: 3, decayedWeight: 1.0, confidence: 1.0 }],
    ]);
    const score = scoreHeadline(
      makeHeadline({ topicIds: "[1,2,3]", sourceName: "Ars Technica", fetchedAt: new Date(now) }),
      interests, now, emptyRecent
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe("deduplicator unicode edge cases", () => {
  it("normalizes titles with accented characters", () => {
    expect(normalizeTitle("Café Culture")).toBe("caf culture");
  });

  it("handles CJK characters in titles", () => {
    // CJK stripped by the regex (only keeps a-z0-9)
    expect(normalizeTitle("AI技術の進歩")).toBe("ai");
  });

  it("deduplicates despite different unicode normalization", () => {
    const headlines = [
      makeRawHeadline({ title: "naïve approach", url: "https://a.com/1" }),
      makeRawHeadline({ title: "naïve approach", url: "https://b.com/2" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(1);
  });

  it("handles URLs with unicode paths", () => {
    const result = normalizeUrl("https://example.com/café/article");
    expect(result).toContain("example.com");
  });

  it("handles empty URL gracefully", () => {
    expect(normalizeUrl("")).toBe("");
  });
});

describe("learner edge cases", () => {
  it("parseTopicIds handles malformed JSON gracefully", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds("{not json}")).toEqual([]);
    expect(parseTopicIds("null")).toEqual([]);
    expect(parseTopicIds("42")).toEqual([]);
  });

  it("parseTopicIds handles non-array JSON", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds('{"a":1}')).toEqual([]);
  });
});
