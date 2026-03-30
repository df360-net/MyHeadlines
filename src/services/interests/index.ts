/**
 * Interest model orchestrator.
 * Scores all headlines and updates the database.
 */

import { db } from "../../db/index.js";
import { headlines, userInterests, digestSends } from "../../db/schema.js";
import { desc, sql } from "drizzle-orm";
import {
  scoreHeadline,
  type InterestWeight,
  type HeadlineToScore,
} from "./scorer.js";
import { HALF_LIFE_MS, DECAY_LAMBDA } from "../../shared/constants.js";

export { processClick, processNegativeFeedback } from "./learner.js";

/**
 * Score all unscored headlines against the user's interest model.
 * Updates the score column in the headlines table.
 */
export function scoreAllHeadlines(): number {
  const now = Date.now();

  // Load interest model with decay applied
  const interests = loadInterestModel(now);

  // Load recent topic counts (for novelty calculation)
  const recentTopicCounts = loadRecentTopicCounts();

  // Get all headlines that need scoring (no score yet, or fetched recently)
  const toScore = db
    .select({
      id: headlines.id,
      topicIds: headlines.topicIds,
      topics: headlines.topics,
      sourceName: headlines.sourceName,
      fetchedAt: headlines.fetchedAt,
    })
    .from(headlines)
    .where(sql`${headlines.score} IS NULL OR ${headlines.fetchedAt} > ${now - 2 * 60 * 60 * 1000}`)
    .all();

  if (toScore.length === 0) return 0;

  // Score each headline
  let scored = 0;
  for (const h of toScore) {
    const score = scoreHeadline(
      h as HeadlineToScore,
      interests,
      now,
      recentTopicCounts
    );

    db.update(headlines)
      .set({ score })
      .where(sql`${headlines.id} = ${h.id}`)
      .run();

    scored++;
  }

  console.log(`[scoring] Scored ${scored} headlines (${interests.size} interests in model)`);
  return scored;
}

/**
 * Load the user's interest model from the database, applying time decay.
 */
function loadInterestModel(now: number): Map<number, InterestWeight> {
  const rows = db.select().from(userInterests).all();
  const model = new Map<number, InterestWeight>();

  for (const row of rows) {
    if (!row.topicId) continue;

    const lastMs =
      row.lastInteraction instanceof Date
        ? row.lastInteraction.getTime()
        : Number(row.lastInteraction);
    const age = now - lastMs;
    const decayedWeight = row.rawWeight * Math.exp(-DECAY_LAMBDA * age);

    // Skip very low weight topics
    if (decayedWeight < 0.01) continue;

    model.set(row.topicId, {
      topicId: row.topicId,
      decayedWeight,
      confidence: row.confidence,
    });
  }

  return model;
}

/**
 * Count how many times each topic appeared in recent digests (last 7 days).
 * Used for novelty scoring — avoid repeating the same topics.
 */
function loadRecentTopicCounts(): Map<number, number> {
  const counts = new Map<number, number>();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const recentDigests = db
    .select({ headlineIds: digestSends.headlineIds })
    .from(digestSends)
    .where(sql`${digestSends.sentAt} > ${weekAgo}`)
    .all();

  for (const digest of recentDigests) {
    let ids: string[];
    try {
      ids = JSON.parse(digest.headlineIds);
    } catch (err) {
      console.warn("[scoring] Failed to parse digest headlineIds:", (err as Error).message);
      continue;
    }

    // Look up topic IDs for each headline in the digest
    for (const id of ids) {
      const h = db
        .select({ topicIds: headlines.topicIds })
        .from(headlines)
        .where(sql`${headlines.id} = ${id}`)
        .get();

      if (!h || !h.topicIds) continue;

      let tids: number[];
      try {
        tids = JSON.parse(h.topicIds);
      } catch (err) {
        console.warn(`[scoring] Failed to parse topicIds for headline ${id}:`, (err as Error).message);
        continue;
      }

      for (const tid of tids) {
        counts.set(tid, (counts.get(tid) || 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Get the top-scored headlines for a digest.
 * Uses 80% exploitation + 20% exploration.
 */
export function getTopHeadlines(count: number = 15): Array<{
  id: string;
  title: string;
  url: string;
  summary: string | null;
  topics: string;
  sourceName: string | null;
  score: number | null;
}> {
  const exploitCount = Math.ceil(count * 0.8);
  const exploreCount = count - exploitCount;

  // Top scored headlines (exploitation)
  const topScored = db
    .select()
    .from(headlines)
    .where(sql`${headlines.fetchedAt} > ${Date.now() - 48 * 60 * 60 * 1000}`) // last 48h
    .orderBy(desc(headlines.score), desc(headlines.fetchedAt))
    .limit(exploitCount)
    .all();

  // Random recent headlines from less-seen topics (exploration)
  const topScoredIds = topScored.map((h) => h.id);
  const excludeClause = topScoredIds.length > 0
    ? sql`AND ${headlines.id} NOT IN (${sql.join(topScoredIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;

  const exploration = db
    .select()
    .from(headlines)
    .where(
      sql`${headlines.fetchedAt} > ${Date.now() - 48 * 60 * 60 * 1000}
          ${excludeClause}
          AND (${headlines.score} IS NULL OR ${headlines.score} < 0.5)`
    )
    .orderBy(sql`RANDOM()`)
    .limit(exploreCount)
    .all();

  return [...topScored, ...exploration];
}
