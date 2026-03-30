import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared utils to avoid DB dependency from getOrCreateTopicId
vi.mock("../../src/services/topics/index.js", () => ({
  getOrCreateTopicId: (slug: string) => slug.length,
}));

import { scoreHeadline, type InterestWeight, type HeadlineToScore } from "../../src/services/interests/scorer.js";

function makeInterestMap(entries: Array<[number, { decayedWeight: number; confidence: number }]>): Map<number, InterestWeight> {
  const map = new Map<number, InterestWeight>();
  for (const [topicId, { decayedWeight, confidence }] of entries) {
    map.set(topicId, { topicId, decayedWeight, confidence });
  }
  return map;
}

function makeHeadline(overrides: Partial<HeadlineToScore> = {}): HeadlineToScore {
  return {
    id: "h-test-001",
    topicIds: JSON.stringify([1, 5]),
    topics: JSON.stringify(["technology", "ai"]),
    sourceName: "Google News - Technology",
    fetchedAt: new Date(),
    ...overrides,
  };
}

describe("scoreHeadline", () => {
  const now = Date.now();
  const emptyRecentCounts = new Map<number, number>();

  it("returns a score between 0 and 1", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.8, confidence: 0.9 }]]);
    const h = makeHeadline({ fetchedAt: new Date(now - 60000) }); // 1 min ago
    const score = scoreHeadline(h, interests, now, emptyRecentCounts);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("gives higher score to matching topics", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.9, confidence: 0.8 }]]);
    const matching = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });
    const nonMatching = makeHeadline({ topicIds: JSON.stringify([999]), fetchedAt: new Date(now) });

    const matchScore = scoreHeadline(matching, interests, now, emptyRecentCounts);
    const noMatchScore = scoreHeadline(nonMatching, interests, now, emptyRecentCounts);

    expect(matchScore).toBeGreaterThan(noMatchScore);
  });

  it("applies freshness decay — older articles score lower", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.8, confidence: 0.8 }]]);
    const fresh = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });
    const stale = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now - 48 * 60 * 60 * 1000) }); // 48h

    const freshScore = scoreHeadline(fresh, interests, now, emptyRecentCounts);
    const staleScore = scoreHeadline(stale, interests, now, emptyRecentCounts);

    expect(freshScore).toBeGreaterThan(staleScore);
  });

  it("uses source quality from lookup table", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.5, confidence: 0.5 }]]);
    const highQuality = makeHeadline({ topicIds: JSON.stringify([1]), sourceName: "Ars Technica", fetchedAt: new Date(now) });
    const unknown = makeHeadline({ topicIds: JSON.stringify([1]), sourceName: "Random Blog", fetchedAt: new Date(now) });

    const hqScore = scoreHeadline(highQuality, interests, now, emptyRecentCounts);
    const unkScore = scoreHeadline(unknown, interests, now, emptyRecentCounts);

    // Ars Technica (0.9) vs default (0.5) — source is 10% of total
    expect(hqScore).toBeGreaterThan(unkScore);
  });

  it("applies novelty penalty for recently shown topics", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.8, confidence: 0.8 }]]);
    const recentCounts = new Map<number, number>([[1, 5]]); // shown 5 times recently
    const h = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });

    const novelScore = scoreHeadline(h, interests, now, emptyRecentCounts);
    const staleScore = scoreHeadline(h, interests, now, recentCounts);

    expect(novelScore).toBeGreaterThan(staleScore);
  });

  it("gives multi-match bonus for headlines with multiple matching topics", () => {
    const interests = makeInterestMap([
      [1, { decayedWeight: 0.6, confidence: 0.5 }],
      [5, { decayedWeight: 0.6, confidence: 0.5 }],
    ]);
    const singleMatch = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });
    const multiMatch = makeHeadline({ topicIds: JSON.stringify([1, 5]), fetchedAt: new Date(now) });

    const singleScore = scoreHeadline(singleMatch, interests, now, emptyRecentCounts);
    const multiScore = scoreHeadline(multiMatch, interests, now, emptyRecentCounts);

    expect(multiScore).toBeGreaterThan(singleScore);
  });

  it("uses cold-start base score (0.5) when no interests exist", () => {
    const noInterests = new Map<number, InterestWeight>();
    const h = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });
    const score = scoreHeadline(h, noInterests, now, emptyRecentCounts);

    // Cold start topicScore=0.5 * 0.5 + freshness * 0.25 + source * 0.1 + novelty * 0.15
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8);
  });

  it("handles null topicIds gracefully", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.8, confidence: 0.8 }]]);
    const h = makeHeadline({ topicIds: null, topics: "[]", fetchedAt: new Date(now) });
    const score = scoreHeadline(h, interests, now, emptyRecentCounts);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("rounds to 4 decimal places", () => {
    const interests = makeInterestMap([[1, { decayedWeight: 0.7, confidence: 0.6 }]]);
    const h = makeHeadline({ topicIds: JSON.stringify([1]), fetchedAt: new Date(now) });
    const score = scoreHeadline(h, interests, now, emptyRecentCounts);
    const decimals = score.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});
