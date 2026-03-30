/**
 * Pre-configured AI provider definitions.
 * User picks a provider during setup — we auto-fill base URL and model.
 */

export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  description: string;
  keyUrl: string; // where to get an API key
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    description: "Popular, high quality",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5-20251001",
    description: "High quality, good responses",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    description: "Good quality, good price",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "custom",
    name: "Custom",
    baseUrl: "",
    defaultModel: "",
    description: "Any OpenAI-compatible API endpoint",
    keyUrl: "",
  },
];

/**
 * Get provider config by ID.
 */
export function getProviderById(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}
