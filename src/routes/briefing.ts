import { Hono } from "hono";
import { getCachedBriefing, type DailyBriefing } from "../services/ai/briefing.js";
import { getDisplayOrder, getInterestWeights } from "../services/topics/index.js";

export const briefingRoutes = new Hono();

function sortBriefingCategories(briefing: DailyBriefing): DailyBriefing {
  const weights = getInterestWeights();
  const sorted = [...briefing.categories].sort(
    (a, b) => getDisplayOrder(a.categoryId, weights) - getDisplayOrder(b.categoryId, weights)
  );
  return { ...briefing, categories: sorted };
}

// GET /api/briefing — return cached briefing from database (instant read)
// Briefings are generated only by the scheduled job at 4:30 PM
briefingRoutes.get("/", (c) => {
  const cached = getCachedBriefing();
  if (cached) return c.json(sortBriefingCategories(cached));

  return c.json({ empty: true, message: "No briefing yet. Your first briefing will be generated at 4:30 PM." });
});
