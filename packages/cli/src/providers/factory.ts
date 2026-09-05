import type { AiProvider, ProviderId } from "../types/index.js";
import { openAiProvider } from "./openai.provider.js";
import { anthropicProvider } from "./anthropic.provider.js";
import { geminiProvider } from "./gemini.provider.js";

const ADAPTERS: Record<ProviderId, AiProvider> = {
  openai: openAiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/**
 * Resolves a provider id to its concrete API adapter. This is the single
 * point of indirection between "which provider the user picked" and
 * "how to actually call that provider's API".
 */
export function getProviderAdapter(providerId: ProviderId): AiProvider {
  return ADAPTERS[providerId];
}
