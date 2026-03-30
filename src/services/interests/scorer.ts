/**
 * Headline scoring engine.
 * Deterministic formula — no LLM, fast, runs on every headline.
 *
 * score = 0.50 * topicRelevance
 *       + 0.25 * freshness
 *       + 0.10 * sourceQuality
 *       + 0.15 * novelty
 */

import { parseTopicIds } from "../../shared/utils.js";

// Source quality ratings (0-1) — manually tuned per RSS source
const SOURCE_QUALITY: Record<string, number> = {
  // Google News channels
  "Google News - Top": 0.8,
  "Google News - Technology": 0.8,
  "Google News - Business": 0.8,
  "Google News - Finance": 0.8,
  "Google News - Science": 0.8,
  "Google News - Health": 0.8,
  "Google News - Sports": 0.8,
  "Google News - Entertainment": 0.7,
  "Google News - World": 0.8,
  "Google News - Politics": 0.8,
  "Google News - Travel": 0.75,
  // Al Jazeera
  "Al Jazeera": 0.9,
  // NPR
  "NPR News": 0.85,
  "NPR - World": 0.85,
  "NPR - Politics": 0.85,
  "NPR - Business": 0.85,
  "NPR - Technology": 0.85,
  // Tech
  "TechCrunch": 0.85,
  "Ars Technica": 0.9,
  "Hacker News - Front Page": 0.85,
};

const FRESHNESS_HALF_LIFE_HOURS = 24;
const FRESHNESS_LAMBDA = Math.LN2 / (FRESHNESS_HALF_LIFE_HOURS * 60 * 60 * 1000);

export interface InterestWeight {
  topicId: number;
  decayedWeight: number;
  confidence: number;
}

export interface HeadlineToScore {
  id: string;
  topicIds: string | null; // JSON array of topic IDs
  topics: string;          // legacy JSON array of slugs (fallback)
  sourceName: string | null;
  fetchedAt: Date | number;
}

/**
 * Score a single headline against the user's interest model.
 */
export function scoreHeadline(
  headline: HeadlineToScore,
  interests: Map<number, InterestWeight>,
  now: number,
  recentTopicCounts: Map<number, number>
): number {
  const tids = parseTopicIds(headline.topicIds, headline.topics);

  // --- Topic relevance (0.0 to 1.0) ---
  let topicScore = 0;
  let matchCount = 0;

  for (const tid of tids) {
    const interest = interests.get(tid);
    if (interest) {
      const effective = interest.decayedWeight * (0.5 + 0.5 * interest.confidence);
      topicScore = Math.max(topicScore, effective);
      matchCount++;
    }
  }

  // Bonus for matching multiple interests
  if (matchCount > 1) {
    topicScore = Math.min(1.0, topicScore * (1 + 0.1 * (matchCount - 1)));
  }

  // If no interests yet (cold start), give a base score so headlines still show
  if (interests.size === 0) {
    topicScore = 0.5;
  }

  // --- Freshness (0.0 to 1.0) ---
  const fetchedMs =
    headline.fetchedAt instanceof Date
      ? headline.fetchedAt.getTime()
      : Number(headline.fetchedAt);
  const ageMs = now - fetchedMs;
  const freshnessScore = Math.exp(-FRESHNESS_LAMBDA * ageMs);

  // --- Source quality (0.0 to 1.0) ---
  const sourceScore = SOURCE_QUALITY[headline.sourceName || ""] ?? 0.5;

  // --- Novelty (0.0 to 1.0) ---
  let recentShowCount = 0;
  for (const tid of tids) {
    recentShowCount += recentTopicCounts.get(tid) || 0;
  }
  const noveltyScore = 1.0 / (1.0 + recentShowCount * 0.3);

  // --- Weighted combination ---
  const score =
    0.50 * topicScore +
    0.25 * freshnessScore +
    0.10 * sourceScore +
    0.15 * noveltyScore;

  return Math.round(score * 10000) / 10000; // 4 decimal places
}
