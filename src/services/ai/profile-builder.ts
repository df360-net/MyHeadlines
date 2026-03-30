/**
 * LLM-powered profile builder.
 * Analyzes browser bookmarks, history, and apps to build initial interest profile.
 */

import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { importedUrls, userInterests } from "../../db/schema.js";
import { sql } from "drizzle-orm";
import { chatCompletion, extractJson, isAiConfigured } from "./client.js";
import { getOrCreateTopicId } from "../topics/index.js";
import { BLOCKED_TOPICS } from "../../shared/constants.js";

interface InterestResult {
  topic: string;
  weight: number;
}

/**
 * Build the user's initial interest profile from imported scan data.
 * Reads bookmarks, history domains, and apps from the database,
 * sends to LLM to extract interests, and stores in user_interests table.
 */
export async function buildInitialProfile(): Promise<number> {
  if (!isAiConfigured()) {
    console.warn("[ai] API key not configured — skipping profile build");
    return 0;
  }

  console.log("[ai] Building initial interest profile from scan data...");

  // Gather data from imported_urls table
  const bookmarks = db
    .select({ title: importedUrls.title, domain: importedUrls.domain })
    .from(importedUrls)
    .where(sql`${importedUrls.source} = 'bookmark'`)
    .limit(200)
    .all();

  const historyDomains = db
    .select({
      domain: importedUrls.domain,
      visits: importedUrls.visitCount,
    })
    .from(importedUrls)
    .where(sql`${importedUrls.source} = 'history'`)
    .orderBy(sql`${importedUrls.visitCount} DESC`)
    .limit(50)
    .all();

  const appsRow = db
    .select({ extractedTopics: importedUrls.extractedTopics })
    .from(importedUrls)
    .where(sql`${importedUrls.source} = 'app'`)
    .get();

  // Build context for the LLM
  const bookmarkTitles = bookmarks
    .filter((b) => b.title)
    .map((b) => b.title)
    .slice(0, 100)
    .join("\n");

  const topDomains = historyDomains
    .filter((h) => h.domain)
    .map((h) => `${h.domain} (${h.visits} visits)`)
    .join("\n");

  const appNames = appsRow?.extractedTopics
    ? (JSON.parse(appsRow.extractedTopics) as string[]).slice(0, 30).join(", ")
    : "";

  const response = await chatCompletion([
    {
      role: "system",
      content: `You analyze a person's browser bookmarks, most-visited websites, and installed applications to determine their interests and areas of expertise.

Return a JSON array of interests with weights (0.0 to 1.0):
- Higher weight = stronger evidence of interest
- Include 10-25 interests
- Use normalized lowercase hyphenated slugs (e.g., "artificial-intelligence", "personal-finance")
- Be specific where evidence supports it (e.g., "react-development" not just "programming")

Example output:
[
  {"topic": "artificial-intelligence", "weight": 0.9},
  {"topic": "personal-finance", "weight": 0.7},
  {"topic": "cooking-recipes", "weight": 0.4}
]`,
    },
    {
      role: "user",
      content: `Analyze this person's digital footprint and extract their interests:

TOP BOOKMARKS (sample of ${bookmarks.length}):
${bookmarkTitles || "(none)"}

MOST VISITED WEBSITES:
${topDomains || "(none)"}

INSTALLED APPLICATIONS:
${appNames || "(none)"}`,
    },
  ]);

  let interests: InterestResult[];
  try {
    interests = extractJson<InterestResult[]>(response.content);
    if (!Array.isArray(interests)) interests = [];
  } catch (err) {
    console.error("[ai] Failed to parse profile response:", (err as Error).message);
    return 0;
  }

  // Store interests in the database
  const now = new Date();
  let storedCount = 0;

  for (const interest of interests) {
    if (!interest.topic || typeof interest.weight !== "number") continue;

    // Filter out adult/NSFW topics
    const topic = interest.topic.toLowerCase().trim();
    if (BLOCKED_TOPICS.some((b) => topic.includes(b))) continue;

    const weight = Math.max(0, Math.min(1, interest.weight));
    const topicId = getOrCreateTopicId(topic);

    db.insert(userInterests)
      .values({
        id: nanoid(12),
        topicId,
        topic, // legacy column
        rawWeight: weight,
        confidence: 0.3, // moderate confidence — inferred, not confirmed by clicks
        source: "bookmark",
        interactionCount: 0,
        lastInteraction: now,
      })
      .onConflictDoNothing()
      .run();

    storedCount++;
  }

  console.log(`[ai] Profile built: ${storedCount} interests extracted`);
  return storedCount;
}
