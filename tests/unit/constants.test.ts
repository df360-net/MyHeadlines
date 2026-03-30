import { describe, it, expect } from "vitest";
import { BLOCKED_TOPICS, HALF_LIFE_MS, DECAY_LAMBDA } from "../../src/shared/constants.js";

describe("BLOCKED_TOPICS", () => {
  it("contains expected blocked keywords", () => {
    expect(BLOCKED_TOPICS).toContain("adult");
    expect(BLOCKED_TOPICS).toContain("nsfw");
    expect(BLOCKED_TOPICS.length).toBeGreaterThanOrEqual(5);
  });

  it("all entries are lowercase strings", () => {
    for (const topic of BLOCKED_TOPICS) {
      expect(topic).toBe(topic.toLowerCase());
      expect(typeof topic).toBe("string");
    }
  });
});

describe("Decay constants", () => {
  it("HALF_LIFE_MS is 30 days in milliseconds", () => {
    expect(HALF_LIFE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("DECAY_LAMBDA is derived from half-life", () => {
    expect(DECAY_LAMBDA).toBeCloseTo(Math.LN2 / HALF_LIFE_MS);
  });

  it("weight after 1 half-life is ~0.5", () => {
    const weight = 1.0 * Math.exp(-DECAY_LAMBDA * HALF_LIFE_MS);
    expect(weight).toBeCloseTo(0.5, 5);
  });

  it("weight after 2 half-lives is ~0.25", () => {
    const weight = 1.0 * Math.exp(-DECAY_LAMBDA * 2 * HALF_LIFE_MS);
    expect(weight).toBeCloseTo(0.25, 5);
  });

  it("weight after 0 time is 1.0", () => {
    const weight = 1.0 * Math.exp(-DECAY_LAMBDA * 0);
    expect(weight).toBe(1.0);
  });
});
