import { Hono } from "hono";
import { getCachedBriefing, generateDailyBriefing, type DailyBriefing } from "../services/ai/briefing.js";
import { getDisplayOrder, getInterestWeights } from "../services/topics/index.js";

export const briefingRoutes = new Hono();

function sortBriefingCategories(briefing: DailyBriefing): DailyBriefing {
  const weights = getInterestWeights();
  const sorted = [...briefing.categories].sort(
    (a, b) => getDisplayOrder(a.categoryId, weights) - getDisplayOrder(b.categoryId, weights)
  );
  return { ...briefing, categories: sorted };
}

// GET /api/briefing — return cached briefing (instant), or generate if refresh=true
briefingRoutes.get("/", async (c) => {
  const refresh = c.req.query("refresh") === "true";

  if (refresh) {
    try {
      const briefing = await generateDailyBriefing();
      return c.json(sortBriefingCategories(briefing));
    } catch (err) {
      console.error("[briefing] Generation failed:", (err as Error).message);
      return c.json({ error: "Failed to generate briefing. Check your AI provider configuration." }, 500);
    }
  }

  // Return cached briefing
  const cached = getCachedBriefing();
  if (cached) return c.json(sortBriefingCategories(cached));

  // No cached briefing yet — generate on first request
  try {
    const briefing = await generateDailyBriefing();
    return c.json(sortBriefingCategories(briefing));
  } catch (err) {
    console.error("[briefing] Generation failed:", (err as Error).message);
    return c.json({ error: "Failed to generate briefing. Check your AI provider configuration." }, 500);
  }
});
