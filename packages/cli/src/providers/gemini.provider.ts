import type { AiProvider, ChatMessage } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { fetchJsonWithRetry } from "./httpClient.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Adapter for Google's Gemini generateContent API.
 * Docs: https://ai.google.dev/api/generate-content
 */
export const geminiProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const { systemInstruction, contents } = toGeminiPayload(messages);

    const result = await fetchJsonWithRetry<GeminiResponse>(buildUrl(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction, contents }),
    });

    if (!result.ok) {
      throw new ProviderError(`Gemini error: ${result.message}`, "gemini", result.kind, result.cause);
    }

    const text = result.data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) {
      throw new ProviderError("Gemini returned an empty response.", "gemini", "unknown");
    }

    return text.trim();
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