/**
 * Interest-based news search.
 * Uses Google News RSS search to find today's headlines for each user interest.
 * Replaces AI feed discovery — no API key, no AI tokens, fast and targeted.
 */

import Parser from "rss-parser";
import { db } from "../../db/index.js";
import { userInterests } from "../../db/schema.js";
import { desc } from "drizzle-orm";
import { getTopicById } from "../topics/index.js";
import type { RawHeadline } from "./rss-fetcher.js";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "MyHeadlines/1.0.0" },
});

const MAX_TOPICS = 10;
const MAX_PER_TOPIC = 10;

/**
 * Search Google News for today's headlines matching each user interest topic.
 * Returns up to MAX_TOPICS × MAX_PER_TOPIC = 100 headlines.
 */
export async function searchNewsByInterests(): Promise<RawHeadline[]> {
  const interests = db
    .select({ topicId: userInterests.topicId, topic: userInterests.topic, weight: userInterests.rawWeight })
    .from(userInterests)
    .orderBy(desc(userInterests.rawWeight))
    .limit(MAX_TOPICS)
    .all();

  if (interests.length === 0) {
    console.log("[interest-search] No interests found — skipping");
    return [];
  }

  // Prefer topic slug from topics table (via topicId), fall back to legacy column
  const topics = interests.map((i) => {
    if (i.topicId) {
      const t = getTopicById(i.topicId);
      if (t) return t.slug;
    }
    return i.topic;
  }).filter(Boolean);
  console.log(`[interest-search] Searching news for ${topics.length} topics: ${topics.join(", ")}`);

  const results = await Promise.allSettled(
    topics.map((topic) => searchTopic(topic))
  );

  const allHeadlines: RawHeadline[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allHeadlines.push(...result.value);
    }
  }

  console.log(`[interest-search] Found ${allHeadlines.length} headlines across ${topics.length} topics`);
  return allHeadlines;
}

/**
 * Search Google News RSS for a single topic, limited to last 24 hours.
 */
async function searchTopic(topic: string): Promise<RawHeadline[]> {
  const query = encodeURIComponent(topic + " when:1d");
  const url = `https://news.google.com/rss/search?q=${query}&hl=en&gl=US&ceid=US:en`;

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || [])
      .filter((item) => item.title && item.link)
      .slice(0, MAX_PER_TOPIC)
      .map((item) => ({
        title: cleanHtml(item.title!),
        url: item.link!,
        summary: item.contentSnippet
          ? cleanHtml(item.contentSnippet).slice(0, 500)
          : undefined,
        sourceName: extractSourceFromTitle(item.title!) || "Google News",
        sourceRss: url,
        category: topic.toLowerCase(),
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
      }));

    console.log(`[interest-search] "${topic}" → ${items.length} headlines`);
    return items;
  } catch (err) {
    console.error(`[interest-search] Failed to search "${topic}":`, (err as Error).message);
    return [];
  }
}

/**
 * Google News titles often end with " - Source Name". Extract it.
 */
function extractSourceFromTitle(title: string): string | undefined {
  const match = title.match(/\s+-\s+([^-]+)$/);
  return match ? match[1].trim() : undefined;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
