import { Hono } from "hono";
import { db } from "../db/index.js";
import { config } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const settingsRoutes = new Hono();

// GET /api/settings
settingsRoutes.get("/", (c) => {
  const rows = db.select().from(config).all();
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return c.json(settings);
});

// Allowed config keys that can be set via the settings API
const ALLOWED_SETTINGS = new Set([
  "email", "phone", "timezone",
  "ai_provider", "ai_api_key", "ai_base_url", "ai_model",
  "ai_temperature", "ai_max_tokens",
  "resend_api_key",
  "twilio_account_sid", "twilio_auth_token", "twilio_phone_number",
  "digest_email_from",
]);

// PUT /api/settings
settingsRoutes.put("/", async (c) => {
  const body = await c.req.json<Record<string, string>>();

  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_SETTINGS.has(key)) {
      rejected.push(key);
      continue;
    }
    db.insert(config)
      .values({ key, value })
      .onConflictDoUpdate({ target: config.key, set: { value } })
      .run();
  }

  if (rejected.length > 0) {
    return c.json({ ok: true, rejected, message: `Unknown keys ignored: ${rejected.join(", ")}` });
  }
  return c.json({ ok: true });
});
