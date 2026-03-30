/**
 * LLM-powered topic extraction for headlines.
 * Batch processes headlines to minimize API calls.
 */

import { chatCompletion, extractJson, isAiConfigured } from "./client.js";

export interface ExtractedTopics {
  index: number;
  topics: string[];
  category: string;
}

/**
 * Extract topics from a batch of headlines using the LLM.
 * Processes up to 15 headlines per call.
 */
export async function extractTopicsBatch(
  headlines: Array<{ index: number; title: string; summary?: string | null }>
): Promise<ExtractedTopics[]> {
  if (!isAiConfigured()) {
    console.warn("[ai] API key not configured — skipping topic extraction");
    return [];
  }

  if (headlines.length === 0) return [];

  const headlineList = headlines
    .map((h) => {
      const summary = h.summary ? ` — ${h.summary.slice(0, 100)}` : "";
      return `${h.index}. ${h.title}${summary}`;
    })
    .join("\n");

  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a news topic classifier. Extract 1-5 specific topic tags from each headline.

Rules:
- Return normalized lowercase slugs using hyphens (e.g., "artificial-intelligence", "federal-reserve", "electric-vehicles")
- Be specific — prefer "electric-vehicles" over "technology", prefer "federal-reserve" over "economy"
- Assign a primary category from: technology, business, politics, science, health, sports, entertainment, world, general
- Return valid JSON array only, no other text

Example output:
[
  {"index": 1, "topics": ["openai", "artificial-intelligence", "enterprise-software"], "category": "technology"},
  {"index": 2, "topics": ["federal-reserve", "interest-rates", "inflation"], "category": "business"}
]`,
    },
    {
      role: "user",
      content: `Extract topics from these headlines:\n\n${headlineList}`,
    },
  ]);

  try {
    const parsed = extractJson<ExtractedTopics[]>(response.content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[ai] Failed to parse topic extraction response:", (err as Error).message);
    return [];
  }
}

/**
 * Process headlines in batches, extracting topics for each.
 * Returns a map of index → topics.
 */
export async function extractTopicsForHeadlines(
  headlines: Array<{ id: string; title: string; summary?: string | null }>,
  batchSize: number = 15
): Promise<Map<string, { topics: string[]; category: string }>> {
  const results = new Map<string, { topics: string[]; category: string }>();

  for (let i = 0; i < headlines.length; i += batchSize) {
    const batch = headlines.slice(i, i + batchSize);
    const indexed = batch.map((h, idx) => ({
      index: idx + 1,
      title: h.title,
      summary: h.summary,
    }));

    try {
      const extracted = await extractTopicsBatch(indexed);

      for (const item of extracted) {
        const headline = batch[item.index - 1];
        if (headline) {
          results.set(headline.id, {
            topics: item.topics,
            category: item.category,
          });
        }
      }

      console.log(
        `[ai] Topics extracted: batch ${Math.floor(i / batchSize) + 1} — ${extracted.length}/${batch.length} headlines`
      );
    } catch (err) {
      console.error(
        `[ai] Topic extraction failed for batch ${Math.floor(i / batchSize) + 1}:`,
        (err as Error).message
      );
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < headlines.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
