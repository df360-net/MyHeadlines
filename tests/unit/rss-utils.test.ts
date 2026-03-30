import { describe, it, expect } from "vitest";
import { categorizeByUrl, cleanHtml } from "../../src/services/news/rss-fetcher.js";

describe("categorizeByUrl", () => {
  it("maps /economy/ path to finance", () => {
    expect(categorizeByUrl("https://www.aljazeera.com/economy/2024/01/01/story", "world"))
      .toBe("finance");
  });

  it("maps /sports/ path to sports", () => {
    expect(categorizeByUrl("https://www.aljazeera.com/sports/cricket", "world"))
      .toBe("sports");
  });

  it("maps /sport/ path to sports", () => {
    expect(categorizeByUrl("https://example.com/sport/football", "general"))
      .toBe("sports");
  });

  it("maps /science-and-technology/ to technology", () => {
    expect(categorizeByUrl("https://aljazeera.com/science-and-technology/article", "world"))
      .toBe("technology");
  });

  it("maps /technology/ to technology", () => {
    expect(categorizeByUrl("https://example.com/technology/ai", "general"))
      .toBe("technology");
  });

  it("maps /features/ to entertainment", () => {
    expect(categorizeByUrl("https://aljazeera.com/features/article", "world"))
      .toBe("entertainment");
  });

  it("maps /opinions/ to politics", () => {
    expect(categorizeByUrl("https://aljazeera.com/opinions/editorial", "world"))
      .toBe("politics");
  });

  it("maps /news/ to world only when defaultCategory is world", () => {
    expect(categorizeByUrl("https://aljazeera.com/news/story", "world")).toBe("world");
    expect(categorizeByUrl("https://example.com/news/story", "general")).toBe("general");
  });

  it("returns defaultCategory for unmatched paths", () => {
    expect(categorizeByUrl("https://example.com/random/path", "technology")).toBe("technology");
  });

  it("returns defaultCategory for invalid URL", () => {
    expect(categorizeByUrl("not-a-url", "general")).toBe("general");
  });

  it("is case-insensitive", () => {
    expect(categorizeByUrl("https://example.com/ECONOMY/article", "world")).toBe("finance");
  });
});

describe("cleanHtml", () => {
  it("strips HTML tags", () => {
    expect(cleanHtml("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("decodes &amp;", () => {
    expect(cleanHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("decodes &lt; and &gt;", () => {
    expect(cleanHtml("a &lt; b &gt; c")).toBe("a < b > c");
  });

  it("decodes &quot; and &#39;", () => {
    expect(cleanHtml("&quot;quoted&quot; and &#39;apostrophe&#39;")).toBe('"quoted" and \'apostrophe\'');
  });

  it("decodes &nbsp; to space", () => {
    expect(cleanHtml("hello&nbsp;world")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(cleanHtml("too    much   space")).toBe("too much space");
  });

  it("trims result", () => {
    expect(cleanHtml("  padded  ")).toBe("padded");
  });

  it("handles empty string", () => {
    expect(cleanHtml("")).toBe("");
  });

  it("handles complex HTML (tags removed, entities decoded)", () => {
    const html = '<div class="article"><h1>Title</h1> <p>Body &amp; <a href="url">link</a></p></div>';
    expect(cleanHtml(html)).toBe("Title Body & link");
  });
});
