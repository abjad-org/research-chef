import type { AiProvider, ChatMessage } from "../types/index.js";
import { ProviderError } from "../types/index.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Adapter for Google's Gemini generateContent API.
 * Docs: https://ai.google.dev/api/generate-content
 */
export const geminiProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      apiKey,
    )}`;

    const { systemInstruction, contents } = toGeminiPayload(messages);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
        }),
      });
    } catch (error) {
      throw new ProviderError(
        "Could not reach Google Gemini. Please check your internet connection.",
        "gemini",
        error,
      );
    }

    const data = (await response.json().catch(() => null)) as GeminiResponse | null;

    if (!response.ok) {
      const message = data?.error?.message ?? `Request failed with status ${response.status}.`;
      throw new ProviderError(`Gemini error: ${message}`, "gemini");
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) {
      throw new ProviderError("Gemini returned an empty response.", "gemini");
    }

    return text.trim();
  },
};

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
