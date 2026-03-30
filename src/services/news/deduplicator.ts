import type { RawHeadline } from "./rss-fetcher.js";

/**
 * Deduplicate headlines by URL and similar titles.
 * Headlines from different sources often cover the same story.
 */
export function deduplicateHeadlines(headlines: RawHeadline[]): RawHeadline[] {
  const seen = new Map<string, RawHeadline>();

  for (const headline of headlines) {
    // Normalize URL: strip query params, trailing slashes, protocol
    const normalizedUrl = normalizeUrl(headline.url);

    // Normalize title for fuzzy matching
    const normalizedTitle = normalizeTitle(headline.title);

    // Check for exact URL match
    if (seen.has(normalizedUrl)) continue;

    // Check for very similar titles (catches same story from different sources)
    let isDuplicate = false;
    for (const [, existing] of seen) {
      if (normalizeTitle(existing.title) === normalizedTitle) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalizedUrl, headline);
    }
  }

  return Array.from(seen.values());
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip common tracking params
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("ref");
    return parsed.hostname + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
