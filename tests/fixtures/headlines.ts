import type { RawHeadline } from "../../src/services/news/rss-fetcher.js";

export function makeRawHeadline(overrides: Partial<RawHeadline> = {}): RawHeadline {
  return {
    title: "Test Headline",
    url: "https://example.com/article-1",
    summary: "A short summary of the article.",
    sourceName: "Google News - Technology",
    sourceRss: "https://news.google.com/rss/topics/technology",
    category: "technology",
    publishedAt: new Date("2026-03-29T10:00:00Z"),
    ...overrides,
  };
}

export function makeHeadlineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "h-test-001",
    topicIds: JSON.stringify([1, 5]),
    topics: JSON.stringify(["technology", "artificial-intelligence"]),
    sourceName: "Google News - Technology",
    fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    ...overrides,
  };
}
