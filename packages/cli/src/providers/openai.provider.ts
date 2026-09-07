import type { AiProvider, ChatMessage, ProviderId } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { fetchJsonWithRetry } from "./httpClient.js";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Builds an adapter for OpenAI's Chat Completions API shape. Used both for
 * the built-in "openai" provider (fixed base URL) and for the "custom"
 * provider, which points at any OpenAI-compatible endpoint the user
 * supplies (Groq, Together AI, OpenRouter, Ollama, self-hosted, etc).
 *
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
export function createOpenAiCompatibleProvider(providerId: ProviderId, defaultBaseUrl: string): AiProvider {
  function resolveEndpoint(baseUrl: string | undefined): string {
    const base = (baseUrl?.trim() || defaultBaseUrl).replace(/\/+$/, "");

    if (!base) {
      throw new ProviderError(
        "No endpoint URL was configured for this provider.",
        providerId,
        "unknown",
      );
    }

    return `${base}/chat/completions`;
  }

  return {
    async sendMessage({ apiKey, model, messages, baseUrl }): Promise<string> {
      const result = await fetchJsonWithRetry<OpenAiChatResponse>(resolveEndpoint(baseUrl), {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: toOpenAiMessages(messages),
          temperature: 0.7,
        }),
      });

      if (!result.ok) {
        throw new ProviderError(`Request failed: ${result.message}`, providerId, result.kind, result.cause);
      }

      const content = result.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError("The provider returned an empty response.", providerId, "unknown");
      }

      return content.trim();
    },

    async testConnection({ apiKey, model, baseUrl }): Promise<void> {
      const result = await fetchJsonWithRetry<OpenAiChatResponse>(resolveEndpoint(baseUrl), {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
        }),
      });

      if (!result.ok) {
        throw new ProviderError(`Request failed: ${result.message}`, providerId, result.kind, result.cause);
      }
    },
  };
}

/** The built-in OpenAI provider, always pointed at OpenAI's own API. */
export const openAiProvider: AiProvider = createOpenAiCompatibleProvider("openai", OPENAI_DEFAULT_BASE_URL);

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Some OpenAI-compatible servers (e.g. a local Ollama instance) don't
  // require authentication at all; skip the header entirely rather than
  // sending "Bearer " with an empty key.
  if (apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}