import type { AiProvider, ChatMessage, WebSource } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { appendSourcesSection } from "../core/citations.js";
import { fetchJsonWithRetry } from "./httpClient.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Adapter for Google's Gemini generateContent API with native grounding
 * via the `google_search` tool always enabled.
 * Docs: https://ai.google.dev/gemini-api/docs/generate-content/google-search
 */
export const geminiProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const { systemInstruction, contents } = toGeminiPayload(messages);

    const result = await fetchJsonWithRetry<GeminiResponse>(buildUrl(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction, contents, tools: [{ google_search: {} }] }),
    });

    if (!result.ok) {
      throw new ProviderError(`Gemini error: ${result.message}`, "gemini", result.kind, result.cause);
    }

    const { text, sources } = parseGeminiResponse(result.data);
    if (!text) {
      throw new ProviderError("Gemini returned an empty response.", "gemini", "unknown");
    }

    return appendSourcesSection(text, sources);
  },

  async testConnection({ apiKey, model }): Promise<void> {
    const result = await fetchJsonWithRetry<GeminiResponse>(buildUrl(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });

    if (!result.ok) {
      throw new ProviderError(`Gemini error: ${result.message}`, "gemini", result.kind, result.cause);
    }
  },
};

function buildUrl(model: string, apiKey: string): string {
  return `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/**
 * Gemini uses "user"/"model" roles (not "assistant") and a dedicated
 * `systemInstruction` field instead of a system-role message.
 */
function toGeminiPayload(messages: ChatMessage[]) {
  const systemContent = messages.find((message) => message.role === "system")?.content;

  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const systemInstruction = systemContent ? { parts: [{ text: systemContent }] } : undefined;

  return { systemInstruction, contents };
}

/**
 * Extracts assistant text plus grounded `web` chunks (uri + title) from a
 * generateContent response. Handles both `groundingMetadata` (current) and
 * `grounding_metadata` (older casing) defensively.
 */
export function parseGeminiResponse(data: GeminiResponse): {
  text: string;
  sources: WebSource[];
} {
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "").trim();

  const raw = data as GeminiResponse & Record<string, unknown>;

  const metadata = (candidate?.groundingMetadata ??
    (candidate as { grounding_metadata?: { groundingChunks?: GeminiGroundingChunk[] } } | undefined)?.grounding_metadata ??
    raw.groundingMetadata) as
    | { groundingChunks?: GeminiGroundingChunk[]; grounding_chunks?: GeminiGroundingChunk[] }
    | undefined;

  const chunks = metadata?.groundingChunks ?? metadata?.grounding_chunks ?? [];
  const sources: WebSource[] = [];
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      sources.push({ title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri });
    }
  }

  return { text, sources };
}
