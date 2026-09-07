import type { AiProvider, ChatMessage } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { fetchJsonWithRetry } from "./httpClient.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;

interface AnthropicResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

/**
 * Adapter for Anthropic's Messages API.
 * Docs: https://docs.claude.com/en/api/messages
 */
export const anthropicProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const { system, conversation } = splitSystemPrompt(messages);

    const result = await fetchJsonWithRetry<AnthropicResponse>(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: conversation,
      }),
    });

    if (!result.ok) {
      throw new ProviderError(`Anthropic error: ${result.message}`, "anthropic", result.kind, result.cause);
    }

    const textBlock = result.data.content?.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new ProviderError("Anthropic returned an empty response.", "anthropic", "unknown");
    }

    return textBlock.text.trim();
  },

  async testConnection({ apiKey, model }): Promise<void> {
    const result = await fetchJsonWithRetry<AnthropicResponse>(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (!result.ok) {
      throw new ProviderError(`Anthropic error: ${result.message}`, "anthropic", result.kind, result.cause);
    }
  },
};

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

/**
 * Anthropic's API takes the system prompt as a separate top-level field
 * rather than as a message with role "system".
 */
function splitSystemPrompt(messages: ChatMessage[]) {
  const system = messages.find((message) => message.role === "system")?.content;
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }));

  return { system, conversation };
}