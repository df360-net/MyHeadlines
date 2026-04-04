/** Briefing cache — read/write daily briefing from the config table. */

import { db } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { DailyBriefing } from "./briefing.js";

const BRIEFING_KEY = "daily_briefing";

/** Get the cached briefing from DB. Returns null if not found or stale. */
export function getCachedBriefing(): DailyBriefing | null {
  const row = db.select().from(config).where(eq(config.key, BRIEFING_KEY)).get();
  if (!row) return null;

  try {
    return JSON.parse(row.value) as DailyBriefing;
  } catch {
    return null;
  }
}

/** Save briefing to DB cache. */
export function saveBriefing(briefing: DailyBriefing): void {
  const json = JSON.stringify(briefing);
  const existing = db.select().from(config).where(eq(config.key, BRIEFING_KEY)).get();
  if (existing) {
    db.update(config).set({ value: json }).where(eq(config.key, BRIEFING_KEY)).run();
  } else {
    db.insert(config).values({ key: BRIEFING_KEY, value: json }).run();
  }
}
