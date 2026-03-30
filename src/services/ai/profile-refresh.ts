/**
 * Daily profile refresh — re-scans browser history/bookmarks
 * and merges new interests into the existing profile.
 * Enriches, never replaces.
 */

import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { importedUrls, userInterests, config } from "../../db/schema.js";
import { sql, eq } from "drizzle-orm";
import { discoverBrowserProfiles } from "../scanner/browser-paths.js";
import { readAllBookmarks } from "../scanner/bookmarks.js";
import { readAllHistory } from "../scanner/history.js";
import { chatCompletion, extractJson, isAiConfigured } from "./client.js";
import { getOrCreateTopicId, getTopicMap } from "../topics/index.js";
import { extractDomain } from "../../shared/utils.js";
import { BLOCKED_TOPICS } from "../../shared/constants.js";

const LAST_SCAN_KEY = "last_profile_scan_at";

interface InterestResult {
  topic: string;
  weight: number;
}

/**
 * Re-scan browser data and enrich the user's interest profile.
 * Only processes new data since the last scan.
 * Returns count of new/updated interests.
 */
export async function refreshProfile(): Promise<{ newTopics: number; boostedTopics: number }> {
  if (!isAiConfigured()) {
    console.warn("[profile-refresh] AI not configured — skipping");
    return { newTopics: 0, boostedTopics: 0 };
  }

  console.log("[profile-refresh] Starting daily profile refresh...");

  // Get last scan timestamp
  const lastScanRow = db.select().from(config).where(eq(config.key, LAST_SCAN_KEY)).get();
  const lastScanAt = lastScanRow ? parseInt(lastScanRow.value) : 0;

  // 1. Discover browser profiles
  const profiles = discoverBrowserProfiles();

  // 2. Read current bookmarks and history
  const bookmarks = readAllBookmarks(profiles);
  const historyDomains = readAllHistory(profiles, 100);

  // 3. Filter to only new data since last scan
  const existingUrls = new Set(
    db.select({ url: importedUrls.url }).from(importedUrls).all().map((r) => r.url)
  );

  const newBookmarks = bookmarks.filter((b) => !existingUrls.has(b.url));
  const newHistory = historyDomains.filter((h) => !existingUrls.has(`https://${h.domain}`));

  console.log(`[profile-refresh] New bookmarks: ${newBookmarks.length}, new history domains: ${newHistory.length}`);

  if (newBookmarks.length === 0 && newHistory.length === 0) {
    console.log("[profile-refresh] No new browser data — skipping AI analysis");
    updateLastScanTime();
    return { newTopics: 0, boostedTopics: 0 };
  }

  // 4. Store new data in imported_urls
  const now = new Date();
  for (const bm of newBookmarks) {
    const domain = extractDomain(bm.url);
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: bm.url,
        title: bm.title,
        domain,
        visitCount: null,
        extractedTopics: null,
        source: "bookmark",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  for (const hd of newHistory) {
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: `https://${hd.domain}`,
        title: hd.domain,
        domain: hd.domain,
        visitCount: hd.totalVisits,
        extractedTopics: null,
        source: "history",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  // 5. Send new data to AI for interest extraction
  const bookmarkTitles = newBookmarks
    .filter((b) => b.title)
    .map((b) => b.title)
    .slice(0, 100)
    .join("\n");

  const topDomains = newHistory
    .filter((h) => h.domain)
    .map((h) => `${h.domain} (${h.totalVisits} visits)`)
    .join("\n");

  // Get existing interests for context
  const existingInterests = db
    .select({ topicId: userInterests.topicId, topic: userInterests.topic, weight: userInterests.rawWeight })
    .from(userInterests)
    .all();

  // Build display list for LLM prompt using topic display names (bulk-loaded)
  const topicMap = getTopicMap();
  const existingList = existingInterests.map((i) => {
    if (i.topicId) {
      const t = topicMap.get(i.topicId);
      return t ? t.slug : i.topic;
    }
    return i.topic;
  }).join(", ");

  const response = await chatCompletion([
    {
      role: "system",
      content: `You analyze a person's NEW browser activity to identify interests. They already have these interests: [${existingList}].

Look at the new data and:
1. Identify NEW interests not already in the list above
2. Identify existing interests that are REINFORCED by this new activity

Return a JSON array:
[{"topic": "topic-slug", "weight": 0.0-1.0, "isNew": true/false}]

Rules:
- Use lowercase hyphenated slugs
- Be specific (e.g., "react-development" not "programming")
- weight reflects how strongly the new data supports this interest
- isNew=true for topics NOT in the existing list, isNew=false for reinforced existing topics
- Return 5-20 items max`,
    },
    {
      role: "user",
      content: `NEW browser activity since last scan:

NEW BOOKMARKS (${newBookmarks.length}):
${bookmarkTitles || "(none)"}

NEW FREQUENTLY VISITED SITES (${newHistory.length}):
${topDomains || "(none)"}`,
    },
  ]);

  let interests: Array<InterestResult & { isNew?: boolean }>;
  try {
    interests = extractJson<Array<InterestResult & { isNew?: boolean }>>(response.content);
    if (!Array.isArray(interests)) interests = [];
  } catch (err) {
    console.error("[profile-refresh] Failed to parse AI response:", (err as Error).message);
    updateLastScanTime();
    return { newTopics: 0, boostedTopics: 0 };
  }

  // 6. Merge into interest model
  let newTopics = 0;
  let boostedTopics = 0;

  for (const interest of interests) {
    if (!interest.topic || typeof interest.weight !== "number") continue;

    const slug = interest.topic.toLowerCase().trim();
    if (BLOCKED_TOPICS.some((b) => slug.includes(b))) continue;

    const weight = Math.max(0, Math.min(1, interest.weight));
    const topicId = getOrCreateTopicId(slug);
    const existing = db.select().from(userInterests).where(eq(userInterests.topicId, topicId)).get();

    if (existing) {
      // Boost existing topic: blend current weight with new evidence
      const boostedWeight = Math.min(1, existing.rawWeight * 0.7 + weight * 0.3);
      const boostedConfidence = Math.min(1, existing.confidence + 0.1);
      db.update(userInterests)
        .set({
          rawWeight: boostedWeight,
          confidence: boostedConfidence,
          lastInteraction: now,
        })
        .where(eq(userInterests.topicId, topicId))
        .run();
      boostedTopics++;
    } else if (interest.isNew !== false) {
      // Add new topic
      db.insert(userInterests)
        .values({
          id: nanoid(12),
          topicId,
          topic: slug, // legacy column
          rawWeight: weight * 0.8, // slightly lower — not yet confirmed by clicks
          confidence: 0.2,
          source: "history",
          interactionCount: 0,
          lastInteraction: now,
        })
        .onConflictDoNothing()
        .run();
      newTopics++;
    }
  }

  updateLastScanTime();
  console.log(`[profile-refresh] Done: ${newTopics} new topics, ${boostedTopics} boosted`);
  return { newTopics, boostedTopics };
}

function updateLastScanTime(): void {
  const now = Date.now().toString();
  const existing = db.select().from(config).where(eq(config.key, LAST_SCAN_KEY)).get();
  if (existing) {
    db.update(config).set({ value: now }).where(eq(config.key, LAST_SCAN_KEY)).run();
  } else {
    db.insert(config).values({ key: LAST_SCAN_KEY, value: now }).run();
  }
}

