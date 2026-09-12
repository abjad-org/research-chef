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
    supportsNativeSearch: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-5",
    keyLooksValid: (key) => key.startsWith("sk-ant-") && key.length >= 20,
    supportsNativeSearch: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-3.8-flash",
    keyLooksValid: (key) => key.length >= 20,
    supportsNativeSearch: true,
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    defaultModel: "",
    // Key formats vary wildly across OpenAI-compatible providers (and some,
    // like a local Ollama server, don't require one at all), so we don't
    // enforce any particular shape here — see isOllamaEndpoint() in
    // setup.ts for the one case where the key is allowed to be empty.
    keyLooksValid: () => true,
    requiresCustomEndpoint: true,
    // Custom endpoints (including Ollama) speak plain Chat Completions with
    // no native search tool — responses reflect the model's own knowledge.
    supportsNativeSearch: false,
  },
];

export function findProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}