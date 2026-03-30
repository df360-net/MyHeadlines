import { Hono } from "hono";
import { db } from "../db/index.js";
import { digestSends } from "../db/schema.js";
import { desc } from "drizzle-orm";
import { sendDailyDigest } from "../services/delivery/index.js";

export const digestRoutes = new Hono();

// POST /api/digest/send — manually trigger a digest
digestRoutes.post("/send", async (c) => {
  try {
    const result = await sendDailyDigest();
    return c.json(result);
  } catch (err) {
    console.error("[digest] Send failed:", (err as Error).message);
    return c.json({ error: "Failed to send digest. Check your delivery settings." }, 500);
  }
});

// GET /api/digest/history — past digests
digestRoutes.get("/history", (c) => {
  const query = db
    .select()
    .from(digestSends)
    .orderBy(desc(digestSends.sentAt))
    .limit(30);

  const results = query.all();

  return c.json({
    digests: results,
    total: results.length,
  });
});
