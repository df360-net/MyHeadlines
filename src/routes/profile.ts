import { Hono } from "hono";
import { db } from "../db/index.js";
import { userInterests } from "../db/schema.js";
import { desc, sql, eq } from "drizzle-orm";
import { getTopicById } from "../services/topics/index.js";
import { HALF_LIFE_MS } from "../shared/constants.js";

export const profileRoutes = new Hono();

// GET /api/profile — returns interest weights sorted by weight
profileRoutes.get("/", (c) => {
  const interests = db
    .select()
    .from(userInterests)
    .orderBy(desc(userInterests.rawWeight))
    .all();

  // Apply decay to weights for display
  const now = Date.now();
  const LAMBDA = Math.LN2 / HALF_LIFE_MS;

  const withDecay = interests.map((i) => {
    const lastMs =
      i.lastInteraction instanceof Date
        ? i.lastInteraction.getTime()
        : Number(i.lastInteraction);
    const age = now - lastMs;
    const decayedWeight = i.rawWeight * Math.exp(-LAMBDA * age);

    // Resolve display name from topics table
    const topic = i.topicId ? getTopicById(i.topicId) : null;

    return {
      topicId: i.topicId,
      topic: topic?.slug ?? i.topic,
      displayName: topic?.displayName ?? i.topic,
      weight: Math.round(decayedWeight * 100),
      rawWeight: i.rawWeight,
      confidence: i.confidence,
      source: i.source,
      interactionCount: i.interactionCount,
    };
  });

  // Sort by decayed weight
  withDecay.sort((a, b) => b.weight - a.weight);

  return c.json({
    interests: withDecay,
    total: withDecay.length,
  });
});

// POST /api/profile/topics/:topicId — adjust or block a topic
profileRoutes.post("/topics/:topicId", async (c) => {
  const topicId = Number(c.req.param("topicId"));
  const { action } = await c.req.json<{
    action: "more" | "less" | "block";
  }>();

  const existing = db
    .select()
    .from(userInterests)
    .where(eq(userInterests.topicId, topicId))
    .get();

  if (!existing) {
    return c.json({ error: "Topic not found" }, 404);
  }

  let newWeight = existing.rawWeight;
  if (action === "more") {
    newWeight = Math.min(1.0, existing.rawWeight + 0.2);
  } else if (action === "less") {
    newWeight = Math.max(0.0, existing.rawWeight - 0.2);
  } else if (action === "block") {
    newWeight = 0;
  }

  db.update(userInterests)
    .set({
      rawWeight: newWeight,
      source: action === "block" ? "explicit" : existing.source,
      lastInteraction: new Date(),
    })
    .where(eq(userInterests.topicId, topicId))
    .run();

  return c.json({ ok: true, topicId, newWeight });
});
