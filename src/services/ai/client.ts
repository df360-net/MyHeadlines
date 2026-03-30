/**
 * Model-agnostic AI client — works with any OpenAI-compatible API.
 * (OpenAI, DeepSeek, Ollama, etc.)
 * Same pattern as AskSQL's AI client.
 */

import { db } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Load AI config from the database, with sensible defaults.
 */
export function getAiConfig(): AiConfig {
  const get = (key: string): string | undefined => {
    const row = db.select().from(config).where(eq(config.key, key)).get();
    return row?.value;
  };

  return {
    apiKey: get("ai_api_key") || process.env.AI_API_KEY || "",
    baseUrl:
      get("ai_base_url") ||
      process.env.AI_BASE_URL ||
      "https://api.openai.com/v1",
    model: get("ai_model") || process.env.AI_MODEL || "gpt-4o-mini",
    temperature: Number(get("ai_temperature") || process.env.AI_TEMPERATURE || "0.3"),
    maxTokens: Number(get("ai_max_tokens") || process.env.AI_MAX_TOKENS || "4096"),
  };
}

/**
 * Check if the AI client is configured (has an API key).
 */
export function isAiConfigured(): boolean {
  const cfg = getAiConfig();
  return cfg.apiKey.length > 0;
}

/**
 * Send a chat completion request to an OpenAI-compatible API.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: Partial<AiConfig>
): Promise<ChatResponse> {
  const cfg = { ...getAiConfig(), ...options };

  if (!cfg.apiKey) {
    throw new Error("AI API key not configured. Set AI_API_KEY env var or configure in settings.");
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
    }),
    signal: AbortSignal.timeout(120000), // 2 minutes — DeepSeek can be slow
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = data.choices?.[0]?.message?.content || "";

  return {
    content,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  };
}

/**
 * Extract JSON from an AI response. Handles markdown fences.
 */
export function extractJson<T>(text: string): T {
  // Try to extract from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find the first [ or { and parse from there
    const start = jsonStr.search(/[\[{]/);
    if (start >= 0) {
      const end = Math.max(jsonStr.lastIndexOf("]"), jsonStr.lastIndexOf("}"));
      if (end > start) {
        return JSON.parse(jsonStr.slice(start, end + 1));
      }
    }
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}`);
  }
}
