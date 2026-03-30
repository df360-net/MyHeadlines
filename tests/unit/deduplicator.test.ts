import { describe, it, expect } from "vitest";
import {
  deduplicateHeadlines,
  normalizeUrl,
  normalizeTitle,
} from "../../src/services/news/deduplicator.js";
import { makeRawHeadline } from "../fixtures/headlines.js";

describe("normalizeUrl", () => {
  it("strips UTM parameters", () => {
    expect(normalizeUrl("https://example.com/article?utm_source=twitter&utm_medium=social"))
      .toBe("example.com/article");
  });

  it("strips ref parameter", () => {
    expect(normalizeUrl("https://example.com/page?ref=homepage"))
      .toBe("example.com/page");
  });

  it("strips trailing slashes", () => {
    expect(normalizeUrl("https://example.com/article/"))
      .toBe("example.com/article");
  });

  it("strips all query params (hostname + pathname only)", () => {
    expect(normalizeUrl("https://example.com/search?q=test"))
      .toBe("example.com/search");
  });

  it("returns original string for invalid URL", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });

  it("combines hostname + path", () => {
    expect(normalizeUrl("https://www.cnn.com/2024/01/01/tech/article"))
      .toBe("www.cnn.com/2024/01/01/tech/article");
  });
});

describe("normalizeTitle", () => {
  it("lowercases text", () => {
    expect(normalizeTitle("Breaking NEWS")).toBe("breaking news");
  });

  it("removes punctuation", () => {
    expect(normalizeTitle("Hello, World! What's up?")).toBe("hello world whats up");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("too   many    spaces")).toBe("too many spaces");
  });

  it("trims whitespace", () => {
    expect(normalizeTitle("  padded  ")).toBe("padded");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("deduplicateHeadlines", () => {
  it("removes exact URL duplicates", () => {
    const headlines = [
      makeRawHeadline({ title: "Article A", url: "https://example.com/article-1" }),
      makeRawHeadline({ title: "Article B", url: "https://example.com/article-1" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Article A"); // keeps first
  });

  it("removes headlines with identical normalized titles", () => {
    const headlines = [
      makeRawHeadline({ title: "Breaking: AI Takes Over!", url: "https://source-a.com/news" }),
      makeRawHeadline({ title: "Breaking: AI Takes Over!", url: "https://source-b.com/news" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(1);
  });

  it("keeps headlines with different titles and URLs", () => {
    const headlines = [
      makeRawHeadline({ title: "Stock Market Rises", url: "https://finance.com/stocks" }),
      makeRawHeadline({ title: "New AI Breakthrough", url: "https://tech.com/ai" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(deduplicateHeadlines([])).toEqual([]);
  });

  it("deduplicates URLs that differ only by tracking params", () => {
    const headlines = [
      makeRawHeadline({ title: "Same Article", url: "https://example.com/article" }),
      makeRawHeadline({ title: "Different Title", url: "https://example.com/article?utm_source=twitter" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(1);
  });

  it("treats titles as duplicates despite different punctuation/casing", () => {
    const headlines = [
      makeRawHeadline({ title: "AI is HERE!", url: "https://a.com/1" }),
      makeRawHeadline({ title: "ai is here", url: "https://b.com/2" }),
    ];
    const result = deduplicateHeadlines(headlines);
    expect(result).toHaveLength(1);
  });
});
