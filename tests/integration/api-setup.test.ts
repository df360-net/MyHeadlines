import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

// Mock heavy services that run during onboarding
vi.mock("../../src/services/scanner/index.js", () => ({
  runFullScan: vi.fn().mockResolvedValue({ bookmarkCount: 10, historyDomainCount: 5, appCount: 3, documentFileCount: 0, topDomains: [], topApps: [] }),
}));

vi.mock("../../src/services/ai/profile-builder.js", () => ({
  buildInitialProfile: vi.fn().mockResolvedValue(8),
}));

vi.mock("../../src/services/news/index.js", () => ({
  refreshHeadlines: vi.fn().mockResolvedValue(25),
}));

vi.mock("../../src/services/news/interest-search.js", () => ({
  searchNewsByInterests: vi.fn().mockResolvedValue([]),
}));

import { Hono } from "hono";
import { setupRoute } from "../../src/routes/setup.js";

function createApp() {
  const app = new Hono();
  app.route("/api/setup", setupRoute);
  return app;
}

describe("GET /api/setup/status", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("returns isSetupComplete=false when not configured", async () => {
    const app = createApp();
    const res = await app.request("/api/setup/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSetupComplete).toBe(false);
  });

  it("returns isSetupComplete=true after setup", async () => {
    testSqlite.prepare(`INSERT INTO config (key, value) VALUES ('setup_complete', 'true')`).run();

    const app = createApp();
    const res = await app.request("/api/setup/status");
    const data = await res.json();
    expect(data.isSetupComplete).toBe(true);
  });
});

describe("GET /api/setup/onboarding", () => {
  it("returns current onboarding status", async () => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;

    const app = createApp();
    const res = await app.request("/api/setup/onboarding");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("step");
    expect(data).toHaveProperty("message");
  });
});

describe("GET /api/setup/providers", () => {
  it("returns list of AI providers", async () => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;

    const app = createApp();
    const res = await app.request("/api/setup/providers");
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.providers).toBeInstanceOf(Array);
    expect(data.providers.length).toBeGreaterThanOrEqual(3);

    const openai = data.providers.find((p: any) => p.id === "openai");
    expect(openai).toBeTruthy();
    expect(openai.name).toBe("OpenAI");

    const custom = data.providers.find((p: any) => p.id === "custom");
    expect(custom.needsCustomUrl).toBe(true);
  });
});

describe("POST /api/setup", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  it("saves all configuration and returns ok", async () => {
    const app = createApp();
    const res = await app.request("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+15551234567",
        email: "test@example.com",
        timezone: "America/New_York",
        aiProvider: "openai",
        aiApiKey: "sk-test-key-123",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify settings saved to DB
    const email = testSqlite.prepare(`SELECT value FROM config WHERE key = 'email'`).get() as any;
    expect(email.value).toBe("test@example.com");

    const apiKey = testSqlite.prepare(`SELECT value FROM config WHERE key = 'ai_api_key'`).get() as any;
    expect(apiKey.value).toBe("sk-test-key-123");

    const setupComplete = testSqlite.prepare(`SELECT value FROM config WHERE key = 'setup_complete'`).get() as any;
    expect(setupComplete.value).toBe("true");
  });

  it("resolves provider base URL and model automatically", async () => {
    const app = createApp();
    await app.request("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "",
        email: "test@example.com",
        timezone: "UTC",
        aiProvider: "deepseek",
        aiApiKey: "ds-test-key",
      }),
    });

    const baseUrl = testSqlite.prepare(`SELECT value FROM config WHERE key = 'ai_base_url'`).get() as any;
    expect(baseUrl.value).toBe("https://api.deepseek.com/v1");

    const model = testSqlite.prepare(`SELECT value FROM config WHERE key = 'ai_model'`).get() as any;
    expect(model.value).toBe("deepseek-chat");
  });

  it("uses custom URL and model for custom provider", async () => {
    const app = createApp();
    await app.request("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "",
        email: "test@example.com",
        timezone: "UTC",
        aiProvider: "custom",
        aiApiKey: "custom-key",
        aiBaseUrl: "http://localhost:11434/v1",
        aiModel: "llama3",
      }),
    });

    const baseUrl = testSqlite.prepare(`SELECT value FROM config WHERE key = 'ai_base_url'`).get() as any;
    expect(baseUrl.value).toBe("http://localhost:11434/v1");

    const model = testSqlite.prepare(`SELECT value FROM config WHERE key = 'ai_model'`).get() as any;
    expect(model.value).toBe("llama3");
  });
});
