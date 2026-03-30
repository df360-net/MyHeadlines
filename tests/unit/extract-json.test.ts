import { describe, it, expect } from "vitest";
import { extractJson } from "../../src/services/ai/client.js";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    const result = extractJson<{ name: string }>('{"name": "hello"}');
    expect(result).toEqual({ name: "hello" });
  });

  it("parses JSON array", () => {
    const result = extractJson<number[]>("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("extracts JSON from markdown code fence", () => {
    const text = 'Here is the result:\n```json\n{"topic": "ai", "weight": 0.8}\n```\nDone!';
    const result = extractJson<{ topic: string; weight: number }>(text);
    expect(result).toEqual({ topic: "ai", weight: 0.8 });
  });

  it("extracts JSON from code fence without language tag", () => {
    const text = '```\n[1, 2, 3]\n```';
    const result = extractJson<number[]>(text);
    expect(result).toEqual([1, 2, 3]);
  });

  it("finds JSON object in surrounding text", () => {
    const text = 'The interests are: {"topic": "sports", "weight": 0.5} as shown.';
    const result = extractJson<{ topic: string; weight: number }>(text);
    expect(result).toEqual({ topic: "sports", weight: 0.5 });
  });

  it("finds JSON array in surrounding text", () => {
    const text = 'Results: [{"a": 1}, {"a": 2}] end';
    const result = extractJson<Array<{ a: number }>>(text);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("throws on completely unparseable text", () => {
    expect(() => extractJson("no json here at all")).toThrow("Failed to parse AI response as JSON");
  });

  it("throws on empty string", () => {
    expect(() => extractJson("")).toThrow();
  });

  it("handles nested JSON objects", () => {
    const text = '{"outer": {"inner": [1, 2]}}';
    const result = extractJson<{ outer: { inner: number[] } }>(text);
    expect(result.outer.inner).toEqual([1, 2]);
  });

  it("handles JSON with whitespace and newlines", () => {
    const text = `\n\n  {\n    "key": "value"\n  }\n\n`;
    const result = extractJson<{ key: string }>(text);
    expect(result).toEqual({ key: "value" });
  });
});
