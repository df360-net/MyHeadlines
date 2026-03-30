/**
 * Topic resolution utility — single source of truth for topic ID lookups.
 * All modules go through here instead of dealing with raw slug strings.
 */

import { db } from "../../db/index.js";
import { topics, userInterests } from "../../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

export interface Topic {
  id: number;
  slug: string;
  displayName: string;
  isFixed: number;
  sortOrder: number;
}

/**
 * Get or create a topic by slug. Returns the integer ID.
 * If the topic doesn't exist, it's auto-created with a title-cased display name.
 */
export function getOrCreateTopicId(slug: string, displayName?: string): number {
  const clean = slug.toLowerCase().trim();
  if (!clean) throw new Error("Topic slug cannot be empty");

  const existing = db.select({ id: topics.id }).from(topics).where(eq(topics.slug, clean)).get();
  if (existing) return existing.id;

  const display = displayName || clean.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  db.insert(topics)
    .values({ slug: clean, displayName: display, isFixed: 0, sortOrder: 999 })
    .onConflictDoNothing()
    .run();

  // Re-fetch in case of race (onConflictDoNothing)
  const row = db.select({ id: topics.id }).from(topics).where(eq(topics.slug, clean)).get();
  if (!row) throw new Error(`Failed to create or find topic: "${clean}"`);
  return row.id;
}

/**
 * Resolve a slug to an ID. Returns null if not found (does NOT create).
 */
export function resolveSlug(slug: string): number | null {
  const clean = slug.toLowerCase().trim();
  if (!clean) return null;
  const row = db.select({ id: topics.id }).from(topics).where(eq(topics.slug, clean)).get();
  return row?.id ?? null;
}

/**
 * Bulk resolve: given an array of slugs, return a map of slug → id.
 * Creates topics that don't exist.
 */
export function bulkResolve(slugs: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const slug of slugs) {
    if (!slug) continue;
    result.set(slug.toLowerCase().trim(), getOrCreateTopicId(slug));
  }
  return result;
}

/**
 * Get a topic by ID.
 */
export function getTopicById(id: number): Topic | null {
  const row = db.select().from(topics).where(eq(topics.id, id)).get();
  return row ? (row as Topic) : null;
}

/**
 * Get all fixed topics, sorted by sortOrder.
 */
export function getFixedTopics(): Topic[] {
  return db
    .select()
    .from(topics)
    .where(eq(topics.isFixed, 1))
    .orderBy(topics.sortOrder)
    .all() as Topic[];
}

/**
 * Get all topics.
 */
export function getAllTopics(): Topic[] {
  return db.select().from(topics).orderBy(topics.sortOrder).all() as Topic[];
}

/**
 * Get a map of topic ID → Topic for fast lookups.
 */
export function getTopicMap(): Map<number, Topic> {
  const all = getAllTopics();
  const map = new Map<number, Topic>();
  for (const t of all) map.set(t.id, t);
  return map;
}

/**
 * Load interest weights as a map of topicId → weight percent (0-100).
 */
export function getInterestWeights(): Map<number, number> {
  const weights = new Map<number, number>();
  const rows = db
    .select({ topicId: userInterests.topicId, weight: userInterests.rawWeight })
    .from(userInterests)
    .orderBy(desc(userInterests.rawWeight))
    .all();
  for (const r of rows) {
    if (r.topicId) weights.set(r.topicId, Math.round(r.weight * 100));
  }
  return weights;
}

/**
 * Unified display order for any topic.
 * Fixed categories: sortOrder (1-6).
 * Personal categories: 400 - weightPercent (higher interest = lower number = appears first).
 * Unknown/no-interest: 999.
 */
export function getDisplayOrder(topicId: number, interestWeights?: Map<number, number>): number {
  const topic = getTopicById(topicId);
  if (!topic) return 999;
  if (topic.isFixed) return topic.sortOrder;

  const weights = interestWeights ?? getInterestWeights();
  const pct = weights.get(topicId);
  return pct != null && pct > 0 ? 400 - pct : 999;
}
