import { describe, it, expect, vi } from "vitest";
import { extractDomain } from "../../src/shared/utils.js";

// Mock at top level to avoid hoisting warning
vi.mock("../../src/services/topics/index.js", () => ({
  getOrCreateTopicId: (slug: string) => slug.length,
}));

describe("extractDomain", () => {
  it("extracts hostname from a valid HTTPS URL", () => {
    expect(extractDomain("https://www.example.com/path")).toBe("www.example.com");
  });

  it("extracts hostname from HTTP URL", () => {
    expect(extractDomain("http://blog.example.org")).toBe("blog.example.org");
  });

  it("extracts hostname from URL with port", () => {
    expect(extractDomain("https://localhost:3000/api")).toBe("localhost");
  });

  it("returns null for invalid URLs", () => {
    expect(extractDomain("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull();
  });

  it("handles URL with query params and hash", () => {
    expect(extractDomain("https://example.com/page?q=1#anchor")).toBe("example.com");
  });
});

describe("parseTopicIds", () => {
  it("parses valid JSON topic ID array", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds(JSON.stringify([1, 5, 12]))).toEqual([1, 5, 12]);
  });

  it("returns empty array for null topicIds", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds(null)).toEqual([]);
  });

  it("returns empty array for invalid JSON", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds("not-json")).toEqual([]);
  });

  it("returns empty array for empty array JSON", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    expect(parseTopicIds("[]")).toEqual([]);
  });

  it("falls back to legacy topics when topicIds is null", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    const result = parseTopicIds(null, JSON.stringify(["tech", "ai"]));
    // Mock returns slug.length as ID
    expect(result).toEqual([4, 2]);
  });

  it("prefers topicIds over legacy topics", async () => {
    const { parseTopicIds } = await import("../../src/shared/utils.js");
    const result = parseTopicIds(JSON.stringify([99]), JSON.stringify(["ignored"]));
    expect(result).toEqual([99]);
  });
});
