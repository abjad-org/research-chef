import type { ProviderInfo } from "../types/index.js";

/**
 * Central catalogue of providers supported by research-chef.
 *
 * This is the single place to edit when adding support for a new provider's
 * metadata (label, default model, key format). The actual request logic for
 * each provider lives in its own adapter file under `providers/`.
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5.6-terra",
    keyLooksValid: (key) => key.startsWith("sk-") && key.length >= 20,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-5",
    keyLooksValid: (key) => key.startsWith("sk-ant-") && key.length >= 20,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-3.8-flash",
    keyLooksValid: (key) => key.length >= 20,
  },
];

export function findProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
