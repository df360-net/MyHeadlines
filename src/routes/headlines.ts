import { Hono } from "hono";
import { db } from "../db/index.js";
import { headlines, userInterests } from "../db/schema.js";
import { desc, sql } from "drizzle-orm";
import { processClick, processNegativeFeedback } from "../services/interests/index.js";
import { getFixedTopics, getTopicById, getDisplayOrder, getInterestWeights } from "../services/topics/index.js";

export const headlinesRoutes = new Hono();

// ── Helpers ──────────────────────────────────────────────

interface CategoryEntry {
  id: number;
  name: string;
  displayName: string;
  count: number;
  isInterest: boolean;
}

/** Bulk-load headline counts for all topic IDs in a single query. */
function bulkCountHeadlinesForTopics(): Map<number, number> {
  // Use a subquery to get distinct (headline_id, topic_id) pairs, then count per topic.
  // This avoids double-counting headlines where categoryId also appears in topicIds.
  const rows = db.all(sql`
    SELECT tid, COUNT(*) AS cnt FROM (
      SELECT id, category_id AS tid FROM headlines WHERE category_id IS NOT NULL
      UNION
      SELECT headlines.id, CAST(json_each.value AS INTEGER) AS tid FROM headlines, json_each(headlines.topic_ids) WHERE headlines.topic_ids IS NOT NULL
    ) GROUP BY tid
  `) as Array<{ tid: number; cnt: number }>;

  const counts = new Map<number, number>();
  for (const { tid, cnt } of rows) {
    counts.set(tid, cnt);
  }
  return counts;
}

/** Build the WHERE clause for headline filtering based on query params. */
function buildHeadlineFilter(topicIdParam: string, exclude: string) {
  if (topicIdParam === "__others__" && exclude) {
    const excludedIds = exclude.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));
    if (excludedIds.length > 0) {
      const conditions = excludedIds.map(
        (id) => sql`(${headlines.categoryId} IS NULL OR ${headlines.categoryId} != ${id})`
      );
      return sql.join(conditions, sql` AND `);
    }
  } else if (topicIdParam && topicIdParam !== "__others__") {
    const tid = Number(topicIdParam);
    if (!isNaN(tid)) {
      return sql`(
        ${headlines.categoryId} = ${tid}
        OR EXISTS (SELECT 1 FROM json_each(${headlines.topicIds}) WHERE json_each.value = ${tid})
      )`;
    }
  }
  return sql`1=1`;
}

/** Build the personal interest categories list (user interests + backfill from RSS). */
function buildPersonalCategories(
  fixedIds: Set<number>,
  topicCounts: Map<number, number>
): CategoryEntry[] {
  const MAX_PERSONAL = 10;
  const seen = new Set<number>();
  const result: CategoryEntry[] = [];

  // User interest topics
  const interests = db
    .select({ topicId: userInterests.topicId, weight: userInterests.rawWeight })
    .from(userInterests)
    .orderBy(desc(userInterests.rawWeight))
    .limit(30)
    .all();

  for (const interest of interests) {
    if (!interest.topicId) continue;
    if (result.length >= MAX_PERSONAL) break;
    if (fixedIds.has(interest.topicId) || seen.has(interest.topicId)) continue;

    const topic = getTopicById(interest.topicId);
    if (!topic) continue;

    const count = topicCounts.get(interest.topicId) || 0;
    if (count > 0) {
      result.push({ id: topic.id, name: topic.slug, displayName: topic.displayName, count, isInterest: true });
      seen.add(interest.topicId);
    }
  }

  // Backfill from RSS categories not already shown (sorted by count desc)
  const sortedCounts = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [catId, count] of sortedCounts) {
    if (result.length >= MAX_PERSONAL) break;
    if (fixedIds.has(catId) || seen.has(catId)) continue;

    const topic = getTopicById(catId);
    if (!topic) continue;

    result.push({ id: topic.id, name: topic.slug, displayName: topic.displayName, count, isInterest: false });
    seen.add(catId);
  }

  // Sort using unified display order
  const weights = getInterestWeights();
  result.sort((a, b) => getDisplayOrder(a.id, weights) - getDisplayOrder(b.id, weights));

  return result;
}

// ── Routes ───────────────────────────────────────────────

// GET /api/headlines?offset=0&limit=20&topicId=5
headlinesRoutes.get("/", (c) => {
  const offset = Math.max(0, Number(c.req.query("offset") || "0") || 0);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "20") || 20));
  const topicIdParam = c.req.query("topicId") || "";
  const exclude = c.req.query("exclude") || "";

  const whereClause = buildHeadlineFilter(topicIdParam, exclude);

  const results = db
    .select()
    .from(headlines)
    .where(whereClause)
    .orderBy(
      sql`(COALESCE(${headlines.score}, 0.3) * 0.6 +
           (1.0 - MIN(1.0, (${Date.now()} - COALESCE(${headlines.publishedAt}, ${headlines.fetchedAt})) / (86400000.0 * 2))) * 0.4
          ) DESC`
    )
    .limit(limit)
    .offset(offset)
    .all();

  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(headlines)
    .where(whereClause)
    .get();

  return c.json({
    headlines: results,
    total: total?.count ?? 0,
    offset,
    limit,
  });
});

// GET /api/headlines/categories — fixed categories + user interest categories
headlinesRoutes.get("/categories", (c) => {
  const fixedTopics = getFixedTopics();
  const fixedIds = new Set(fixedTopics.map((t) => t.id));

  // Single bulk query for all topic counts (replaces N+1 per-topic queries)
  const topicCounts = bulkCountHeadlinesForTopics();

  const fixedCategories: CategoryEntry[] = fixedTopics.map((topic) => ({
    id: topic.id,
    name: topic.slug,
    displayName: topic.displayName,
    count: topicCounts.get(topic.id) || 0,
    isInterest: false,
  }));

  const categories = buildPersonalCategories(fixedIds, topicCounts);

  return c.json({ fixedCategories, categories });
});

// POST /api/headlines/:id/feedback
headlinesRoutes.post("/:id/feedback", async (c) => {
  const { id } = c.req.param();
  const { feedback } = await c.req.json<{ feedback: "up" | "down" | "none" }>();

  const value = feedback === "none" ? null : feedback;

  db.update(headlines)
    .set({ feedback: value })
    .where(sql`${headlines.id} = ${id}`)
    .run();

  if (feedback === "up") {
    processClick(id, "web");
  } else if (feedback === "down") {
    processNegativeFeedback(id);
  }

  return c.json({ ok: true });
});
