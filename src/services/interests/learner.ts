/**
 * Interest learning from click behavior.
 * Uses Exponential Moving Average (EMA) to update interest weights.
 */

import { db } from "../../db/index.js";
import { userInterests, headlines } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parseTopicIds } from "../../shared/utils.js";

const POSITIVE_ALPHA = 0.3;   // learning rate for clicks (strong signal)
const NEGATIVE_ALPHA = 0.05;  // learning rate for ignores (weak signal)
const CONFIDENCE_GROWTH = 0.05;

/**
 * Process a click event — strengthen the interest in clicked headline's topics.
 */
export function processClick(headlineId: string, channel: string) {
  // Get the headline's topic IDs
  const headline = db
    .select({ topicIds: headlines.topicIds })
    .from(headlines)
    .where(eq(headlines.id, headlineId))
    .get();

  if (!headline) return;

  const tids = parseTopicIds(headline.topicIds);

  const now = new Date();

  for (const topicId of tids) {
    const existing = db
      .select()
      .from(userInterests)
      .where(eq(userInterests.topicId, topicId))
      .get();

    if (existing) {
      const newWeight = POSITIVE_ALPHA * 1.0 + (1 - POSITIVE_ALPHA) * existing.rawWeight;
      const newConfidence = Math.min(1.0, existing.confidence + CONFIDENCE_GROWTH);

      db.update(userInterests)
        .set({
          rawWeight: newWeight,
          confidence: newConfidence,
          interactionCount: existing.interactionCount + 1,
          lastInteraction: now,
        })
        .where(eq(userInterests.topicId, topicId))
        .run();
    } else {
      db.insert(userInterests)
        .values({
          id: nanoid(12),
          topicId,
          topic: "", // legacy — will be unused
          rawWeight: 0.5,
          confidence: CONFIDENCE_GROWTH,
          source: "click",
          interactionCount: 1,
          lastInteraction: now,
        })
        .run();
    }
  }
}

/**
 * Process negative feedback — weaken the interest in thumbs-down headline's topics.
 */
export function processNegativeFeedback(headlineId: string) {
  const headline = db
    .select({ topicIds: headlines.topicIds })
    .from(headlines)
    .where(eq(headlines.id, headlineId))
    .get();

  if (!headline) return;

  const tids = parseTopicIds(headline.topicIds);
  if (tids.length === 0) return;

  for (const topicId of tids) {
    const existing = db
      .select()
      .from(userInterests)
      .where(eq(userInterests.topicId, topicId))
      .get();

    if (existing) {
      const newWeight = NEGATIVE_ALPHA * 0.0 + (1 - NEGATIVE_ALPHA) * existing.rawWeight;

      db.update(userInterests)
        .set({
          rawWeight: Math.max(0, newWeight),
          lastInteraction: new Date(),
        })
        .where(eq(userInterests.topicId, topicId))
        .run();
    }
  }
}
