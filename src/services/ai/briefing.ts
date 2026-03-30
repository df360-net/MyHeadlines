/**
 * AI-powered daily briefing generator.
 * Picks the most important headlines per category from today,
 * then summarizes each into a concise 1-2 sentence summary.
 * Results are cached in the DB so the UI loads instantly.
 */

import { db } from "../../db/index.js";
import { headlines } from "../../db/schema.js";
import { sql } from "drizzle-orm";
import { chatCompletion, extractJson, isAiConfigured } from "./client.js";
import { getTopicById, getOrCreateTopicId, getDisplayOrder, getInterestWeights } from "../topics/index.js";
import { parseTopicIds } from "../../shared/utils.js";
import { saveBriefing } from "./briefing-cache.js";
export { getCachedBriefing } from "./briefing-cache.js";

interface BriefingHeadline {
  title: string;
  url: string;
  summary: string;
}

export interface BriefingCategory {
  categoryId: number;
  category: string; // display name
  headlines: BriefingHeadline[];
}

export interface DailyBriefing {
  date: string;
  categories: BriefingCategory[];
  generatedAt: string;
}

/**
 * Get today's headlines grouped by category.
 */
function getTodaysHeadlinesByCategory(): Map<number, Array<{ title: string; url: string; summary: string | null }>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const rows = db
    .select({
      title: headlines.title,
      url: headlines.url,
      summary: headlines.summary,
      categoryId: headlines.categoryId,
      topicIds: headlines.topicIds,
      category: headlines.category,
      score: headlines.score,
    })
    .from(headlines)
    .where(sql`COALESCE(${headlines.publishedAt}, ${headlines.fetchedAt}) >= ${todayMs}`)
    .orderBy(sql`COALESCE(${headlines.score}, 0.3) DESC`)
    .all();

  const grouped = new Map<number, Array<{ title: string; url: string; summary: string | null }>>();

  for (const row of rows) {
    const item = { title: row.title, url: row.url, summary: row.summary };

    // Add to all topic ID categories (not just the primary categoryId)
    const allIds = new Set<number>();
    if (row.categoryId) allIds.add(row.categoryId);
    for (const tid of parseTopicIds(row.topicIds)) allIds.add(tid);
    if (allIds.size === 0 && row.category) {
      allIds.add(getOrCreateTopicId(row.category));
    }

    for (const catId of allIds) {
      const list = grouped.get(catId);
      if (list) {
        list.push(item);
      } else {
        grouped.set(catId, [item]);
      }
    }
  }

  return grouped;
}

/**
 * Ask AI to pick the most important headlines and summarize them.
 */
async function summarizeCategory(
  category: string,
  items: Array<{ title: string; url: string; summary: string | null }>
): Promise<BriefingHeadline[]> {
  const maxPick = Math.min(5, items.length);

  const headlineList = items
    .map((h, i) => `${i + 1}. ${h.title}${h.summary ? ` — ${h.summary.slice(0, 150)}` : ""}`)
    .join("\n");

  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a news editor creating a daily briefing. Pick the ${maxPick} most important/interesting headlines from the list and write a 3-4 sentence summary for each that gives the reader a solid understanding of the story. Return JSON array.`,
    },
    {
      role: "user",
      content: `Category: ${category}\n\nHeadlines:\n${headlineList}\n\nReturn a JSON array of objects with "index" (1-based from the list above) and "summary" (your 1-2 sentence summary). Pick up to ${maxPick} most important ones.`,
    },
  ]);

  const picks = extractJson<Array<{ index: number; summary: string }>>(response.content);

  return picks
    .filter((p) => p.index >= 1 && p.index <= items.length)
    .map((p) => ({
      title: items[p.index - 1].title,
      url: items[p.index - 1].url,
      summary: p.summary,
    }));
}

/**
 * Generate the daily briefing and save to DB.
 * Called by the scheduler job twice a day.
 */
export async function generateDailyBriefing(): Promise<DailyBriefing> {
  const today = new Date().toISOString().slice(0, 10);

  if (!isAiConfigured()) {
    throw new Error("AI is not configured. Please set up your AI API key in settings.");
  }

  const grouped = getTodaysHeadlinesByCategory();

  if (grouped.size === 0) {
    const empty: DailyBriefing = { date: today, categories: [], generatedAt: new Date().toISOString() };
    saveBriefing(empty);
    return empty;
  }

  // Unified sort: getDisplayOrder() returns a single number for any topic.
  // Fixed topics: 1-6, personal interests: 400-weightPct, others: 999.
  const weights = getInterestWeights();
  const sortedCategories = [...grouped.entries()]
    .sort((a, b) => getDisplayOrder(a[0], weights) - getDisplayOrder(b[0], weights))
    .slice(0, 15);

  // Process categories in parallel (batch of 3 to avoid rate limits)
  const categories: BriefingCategory[] = [];

  for (let i = 0; i < sortedCategories.length; i += 3) {
    const batch = sortedCategories.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async ([categoryId, items]) => {
        const topic = getTopicById(categoryId);
        const displayName = topic?.displayName ?? `Topic ${categoryId}`;
        try {
          const picked = items.length <= 2
            ? items.map((h) => ({ title: h.title, url: h.url, summary: h.summary || h.title }))
            : await summarizeCategory(displayName, items);
          return { categoryId, category: displayName, headlines: picked };
        } catch (err) {
          console.error(`[briefing] Failed to summarize ${displayName}:`, (err as Error).message);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && r.headlines.length > 0) categories.push(r);
    }
  }

  const briefing: DailyBriefing = {
    date: today,
    categories,
    generatedAt: new Date().toISOString(),
  };

  saveBriefing(briefing);
  console.log(`[briefing] Generated briefing: ${categories.length} categories, ${categories.reduce((n, c) => n + c.headlines.length, 0)} headlines`);
  return briefing;
}
