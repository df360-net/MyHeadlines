import Parser from "rss-parser";
import { getAllSources, type RssSource } from "./sources.js";

/** Only keep articles published within the last N hours. */
const MAX_AGE_HOURS = 24;

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "MyHeadlines/1.0.0",
  },
});

export interface RawHeadline {
  title: string;
  url: string;
  summary: string | undefined;
  sourceName: string;
  sourceRss: string;
  category: string;
  publishedAt: Date | undefined;
}

/**
 * Fetch headlines from a single RSS source.
 */
async function fetchSource(source: RssSource): Promise<RawHeadline[]> {
  try {
    const feed = await parser.parseURL(source.url);

    const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;

    return (feed.items || [])
      .filter((item) => {
        if (!item.title || !item.link) return false;
        // Drop articles older than MAX_AGE_HOURS
        if (item.pubDate) {
          const pub = new Date(item.pubDate).getTime();
          if (pub < cutoff) return false;
        }
        return true;
      })
      .map((item) => ({
        title: cleanHtml(item.title!),
        url: item.link!,
        summary: item.contentSnippet
          ? cleanHtml(item.contentSnippet).slice(0, 500)
          : undefined,
        sourceName: source.name,
        sourceRss: source.url,
        category: categorizeByUrl(item.link!, source.category),
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
      }));
  } catch (err) {
    console.error(`[rss] Failed to fetch ${source.name}:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetch headlines from all configured RSS sources.
 */
export async function fetchAllSources(): Promise<RawHeadline[]> {
  const sources = getAllSources();
  console.log(`[rss] Fetching from ${sources.length} sources...`);

  const results = await Promise.allSettled(
    sources.map((source) => fetchSource(source))
  );

  const allHeadlines: RawHeadline[] = [];
  let successCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      allHeadlines.push(...result.value);
      if (result.value.length > 0) successCount++;
    }
  }

  console.log(
    `[rss] Fetched ${allHeadlines.length} headlines from ${successCount}/${sources.length} sources.`
  );

  return allHeadlines;
}

/**
 * Determine category from the article URL path.
 * Used for sources like Al Jazeera that have a single mixed feed.
 * For most sources, returns the source's default category unchanged.
 */
export function categorizeByUrl(url: string, defaultCategory: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();

    if (path.includes("/economy/")) return "finance";
    if (path.includes("/sports/") || path.includes("/sport/")) return "sports";
    if (path.includes("/science-and-technology/") || path.includes("/technology/")) return "technology";
    if (path.includes("/features/")) return "entertainment";
    if (path.includes("/opinions/") || path.includes("/opinion/")) return "politics";
    // /news/ is Al Jazeera's world news section — but only re-map for Al Jazeera
    if (path.includes("/news/") && defaultCategory === "world") return "world";
  } catch {
    // Invalid URL — fall through to default
  }

  return defaultCategory;
}

/**
 * Strip HTML tags and decode entities from RSS content.
 */
export function cleanHtml(text: string): string {
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
