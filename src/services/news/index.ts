import { nanoid } from "nanoid";
import { db, sqlite } from "../../db/index.js";
import { headlines } from "../../db/schema.js";
import { fetchAllSources, type RawHeadline } from "./rss-fetcher.js";
import { deduplicateHeadlines } from "./deduplicator.js";
import { getOrCreateTopicId } from "../topics/index.js";
import { sql } from "drizzle-orm";

/**
 * Fetch headlines from all sources, deduplicate, and store in the database.
 * Returns the number of new headlines added.
 */
export async function refreshHeadlines(extraHeadlines: RawHeadline[] = []): Promise<number> {
  // 1. Fetch from all RSS sources + merge any extra (e.g. interest search)
  const rss = await fetchAllSources();
  const raw = [...rss, ...extraHeadlines];

  // 2. Deduplicate
  const unique = deduplicateHeadlines(raw);
  console.log(`[news] ${raw.length} raw → ${unique.length} after dedup`);

  // 3. Store new headlines (skip if URL already exists)
  let newCount = 0;
  const now = Date.now();

  // Prepare the FTS insert statement
  const ftsInsert = sqlite.prepare(
    `INSERT OR IGNORE INTO headlines_fts(rowid, title, summary) VALUES (?, ?, ?)`
  );

  // Use a transaction for batch insert performance
  const insertMany = sqlite.transaction(() => {
    for (const headline of unique) {
      // Check if URL already exists
      const existing = db
        .select({ id: headlines.id })
        .from(headlines)
        .where(sql`${headlines.url} = ${headline.url}`)
        .get();

      if (existing) continue;

      const id = nanoid(12);

      // Resolve RSS category to a topic ID (e.g. "politics" → 1)
      const catId = headline.category
        ? getOrCreateTopicId(headline.category)
        : null;

      db.insert(headlines)
        .values({
          id,
          title: headline.title,
          url: headline.url,
          summary: headline.summary || null,
          topicIds: catId ? JSON.stringify([catId]) : null,
          categoryId: catId,
          topics: headline.category ? JSON.stringify([headline.category]) : JSON.stringify([]),
          category: headline.category || null,
          sourceRss: headline.sourceRss,
          sourceName: headline.sourceName,
          publishedAt: headline.publishedAt || null,
          fetchedAt: new Date(now),
          score: null,
          feedback: null,
        })
        .run();

      // Index in FTS5 for full-text search
      // Use a numeric rowid derived from the nanoid
      try {
        ftsInsert.run(hashId(id), headline.title, headline.summary || "");
      } catch {
        // FTS insert can fail if rowid collides — rare, not critical
      }

      newCount++;
    }
  });

  try {
    insertMany();
  } catch (err) {
    console.error("[news] Transaction failed during headline insert:", (err as Error).message);
    // Return 0 — partial inserts are rolled back by the transaction
    return 0;
  }

  console.log(`[news] ${newCount} new headlines stored.`);

  return newCount;
}

/**
 * Clean up headlines older than the given number of days.
 */
export function cleanupOldHeadlines(days: number = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const result = db
    .delete(headlines)
    .where(sql`${headlines.fetchedAt} < ${cutoff}`)
    .run() as unknown as { changes: number };

  if (result.changes > 0) {
    console.log(`[news] Cleaned up ${result.changes} headlines older than ${days} days.`);
  }
}

/**
 * Numeric hash from a string ID for FTS5 rowid.
 * Uses two 32-bit hashes combined to reduce collision probability.
 */
function hashId(id: string): number {
  let h1 = 0;
  let h2 = 0x9e3779b9; // golden ratio seed
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = (h1 * 31 + c) | 0;
    h2 = (h2 * 37 + c) | 0;
  }
  // Combine into a positive 48-bit-ish number (safe for SQLite INTEGER)
  return Math.abs(h1) * 65536 + (Math.abs(h2) & 0xffff);
}
