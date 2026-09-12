import type { AiProvider, ChatMessage, ProviderId, WebSource } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { appendSourcesSection } from "../core/citations.js";
import { fetchJsonWithRetry } from "./httpClient.js";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_RESPONSES_PATH = "/responses";
export const OPENAI_CHAT_COMPLETIONS_PATH = "/chat/completions";

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface OpenAiResponsesAnnotation {
  type?: string;
  url?: string;
  title?: string;
}

interface OpenAiResponsesContent {
  type?: string;
  text?: string;
  annotations?: OpenAiResponsesAnnotation[];
}

interface OpenAiResponsesOutputItem {
  type?: string;
  role?: string;
  content?: OpenAiResponsesContent[];
}

interface OpenAiResponsesResponse {
  output?: OpenAiResponsesOutputItem[];
  output_text?: string;
}

export interface OpenAiCompatibleOptions {
  /**
   * When true, requests go to the Responses API (`POST {base}/responses`)
   * with the native `web_search` tool enabled, and citations are parsed
   * from `url_citation` annotations. When false (default), requests use
   * the legacy Chat Completions shape with no search tool — used by the
   * custom provider, which must behave exactly as before.
   */
  webSearch?: boolean;
}

/**
 * Builds an adapter for OpenAI-compatible endpoints.
 *
 * - The built-in "openai" provider uses the Responses API with native
 *   `web_search` always enabled (per docs, Chat Completions only supports
 *   specialized search models, so Responses is the path for real search).
 *   Docs: https://developers.openai.com/api/docs/guides/tools-web-search
 * - The "custom" provider keeps the plain Chat Completions shape with no
 *   search tool, preserving today's behavior for Ollama and friends.
 */
export function createOpenAiCompatibleProvider(
  providerId: ProviderId,
  defaultBaseUrl: string,
  options: OpenAiCompatibleOptions = {},
): AiProvider {
  const webSearch = options.webSearch === true;

  function resolveEndpoint(baseUrl: string | undefined): string {
    const base = (baseUrl?.trim() || defaultBaseUrl).replace(/\/+$/, "");

    if (!base) {
      throw new ProviderError(
        "No endpoint URL was configured for this provider.",
        providerId,
        "unknown",
      );
    }

    return `${base}${webSearch ? OPENAI_RESPONSES_PATH : OPENAI_CHAT_COMPLETIONS_PATH}`;
  }

  if (webSearch) {
    return {
      async sendMessage({ apiKey, model, messages, baseUrl }): Promise<string> {
        const result = await fetchJsonWithRetry<OpenAiResponsesResponse>(resolveEndpoint(baseUrl), {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: JSON.stringify({
            model,
            tools: [{ type: "web_search" }],
            input: toResponsesInput(messages),
          }),
        });

        if (!result.ok) {
          throw new ProviderError(`Request failed: ${result.message}`, providerId, result.kind, result.cause);
        }

        const { text, sources } = parseResponsesOutput(result.data);
        if (!text) {
          throw new ProviderError("The provider returned an empty response.", providerId, "unknown");
        }

        return appendSourcesSection(text, sources);
      },

      async testConnection({ apiKey, model, baseUrl }): Promise<void> {
        const result = await fetchJsonWithRetry<OpenAiResponsesResponse>(resolveEndpoint(baseUrl), {
          method: "POST",
          headers: buildHeaders(apiKey),
          body: JSON.stringify({
            model,
            input: "Hi",
            max_output_tokens: 1,
          }),
        });

        if (!result.ok) {
          throw new ProviderError(`Request failed: ${result.message}`, providerId, result.kind, result.cause);
        }
      },
    };
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

/** The built-in OpenAI provider: Responses API with native web search. */
export const openAiProvider: AiProvider = createOpenAiCompatibleProvider("openai", OPENAI_DEFAULT_BASE_URL, {
  webSearch: true,
});

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

/**
 * Maps the shared conversation shape onto Responses API `input` items.
 * The Responses API accepts the same role/content pairs; "system" items
 * are passed through as developer-visible instructions.
 */
export function toResponsesInput(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

/**
 * Extracts the assistant text plus any `url_citation` sources from a
 * Responses API payload. Falls back to the aggregated `output_text`
 * field when no message items are present.
 */
export function parseResponsesOutput(data: OpenAiResponsesResponse): { text: string; sources: WebSource[] } {
  const texts: string[] = [];
  const sources: WebSource[] = [];

  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      if (part.text) texts.push(part.text);
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          sources.push({ title: annotation.title ?? annotation.url, url: annotation.url });
        }
      }
    }
  }

  const text = (texts.join("") || data.output_text || "").trim();
  return { text, sources };
}
