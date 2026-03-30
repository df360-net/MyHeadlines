import { getOrCreateTopicId } from "../services/topics/index.js";

/** Extract hostname from a URL, returning null on invalid input. */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Parse topic IDs from a headline row.
 * Prefers the numeric topicIds column; falls back to resolving legacy slug array.
 */
export function parseTopicIds(topicIds: string | null, legacyTopics?: string | null): number[] {
  if (topicIds) {
    try {
      const tids = JSON.parse(topicIds);
      if (Array.isArray(tids) && tids.length > 0) return tids;
    } catch { /* fall through */ }
  }
  if (legacyTopics) {
    try {
      const slugs = JSON.parse(legacyTopics) as string[];
      return slugs.map((s) => getOrCreateTopicId(s));
    } catch { /* ignore */ }
  }
  return [];
}
