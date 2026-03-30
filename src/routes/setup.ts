import { Hono } from "hono";
import { db } from "../db/index.js";
import { config } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { runFullScan } from "../services/scanner/index.js";
import { buildInitialProfile } from "../services/ai/profile-builder.js";
import { AI_PROVIDERS, getProviderById } from "../services/ai/providers.js";
import { refreshHeadlines } from "../services/news/index.js";
import { searchNewsByInterests } from "../services/news/interest-search.js";

const ONBOARDING_KEY = "onboarding_status";

/** Read onboarding state from DB (survives crashes). Falls back to in-memory for speed. */
function getOnboardingStatus(): { step: string; message: string } {
  const row = db.select().from(config).where(eq(config.key, ONBOARDING_KEY)).get();
  if (!row) return { step: "idle", message: "" };
  try { return JSON.parse(row.value); } catch { return { step: "idle", message: "" }; }
}

function setOnboardingStatus(step: string, message: string) {
  const value = JSON.stringify({ step, message });
  db.insert(config)
    .values({ key: ONBOARDING_KEY, value })
    .onConflictDoUpdate({ target: config.key, set: { value } })
    .run();
}

export const setupRoute = new Hono();

// GET /api/setup/status
setupRoute.get("/status", (c) => {
  const row = db
    .select()
    .from(config)
    .where(eq(config.key, "setup_complete"))
    .get();

  return c.json({
    isSetupComplete: row?.value === "true",
  });
});

// GET /api/setup/onboarding — poll onboarding progress
setupRoute.get("/onboarding", (c) => {
  return c.json(getOnboardingStatus());
});

// GET /api/setup/providers — list available AI providers
setupRoute.get("/providers", (c) => {
  return c.json({
    providers: AI_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      keyUrl: p.keyUrl,
      needsCustomUrl: p.id === "custom",
    })),
  });
});

// POST /api/setup
setupRoute.post("/", async (c) => {
  const body = await c.req.json<{
    phone: string;
    email: string;
    timezone: string;
    aiProvider: string;
    aiApiKey: string;
    aiBaseUrl?: string;   // only for "custom" provider
    aiModel?: string;     // only for "custom" provider
  }>();

  const { phone, email, timezone, aiProvider, aiApiKey } = body;

  // Basic email validation
  if (email && !email.includes("@")) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  // Resolve provider config
  const provider = getProviderById(aiProvider);
  const baseUrl = aiProvider === "custom"
    ? (body.aiBaseUrl || "")
    : (provider?.baseUrl || "");
  const model = aiProvider === "custom"
    ? (body.aiModel || "")
    : (provider?.defaultModel || "");

  // Save all settings
  const settings = [
    { key: "phone", value: phone },
    { key: "email", value: email },
    { key: "timezone", value: timezone },
    { key: "ai_provider", value: aiProvider },
    { key: "ai_api_key", value: aiApiKey },
    { key: "ai_base_url", value: baseUrl },
    { key: "ai_model", value: model },
    { key: "setup_complete", value: "true" },
  ];

  for (const { key, value } of settings) {
    db.insert(config)
      .values({ key, value })
      .onConflictDoUpdate({ target: config.key, set: { value } })
      .run();
  }

  console.log(
    `[setup] Complete — email: ${email}, provider: ${aiProvider}, model: ${model}`
  );

  // Run onboarding in background — state persisted to DB so it survives crashes
  (async () => {
    try {
      setOnboardingStatus("scanning", "Scanning your browser bookmarks and history...");
      const scanResult = await runFullScan();
      console.log(
        `[setup] Scan done — ${scanResult.bookmarkCount} bookmarks, ${scanResult.historyDomainCount} domains, ${scanResult.appCount} apps`
      );

      setOnboardingStatus("building_profile", "Learning your interests...");
      const interestCount = await buildInitialProfile();
      console.log(`[setup] Interest profile built — ${interestCount} interests`);

      setOnboardingStatus("fetching_news", "Fetching your personalized news...");
      const interestHeadlines = await searchNewsByInterests();
      const newCount = await refreshHeadlines(interestHeadlines);
      console.log(`[setup] ${newCount} headlines fetched`);

      setOnboardingStatus("done", "Ready!");
    } catch (err) {
      console.error("[setup] Onboarding failed:", err);
      setOnboardingStatus("error", "Onboarding failed. Please check your AI provider settings and try again.");
    }
  })();

  return c.json({
    ok: true,
    message: "Setup complete. Scanning your computer for interests...",
  });
});
