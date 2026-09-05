import type { AiProvider, ChatMessage } from "../types/index.js";
import { ProviderError } from "../types/index.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;

interface AnthropicResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Adapter for Anthropic's Messages API.
 * Docs: https://docs.claude.com/en/api/messages
 */
export const anthropicProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const { system, conversation } = splitSystemPrompt(messages);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: conversation,
        }),
      });
    } catch (error) {
      throw new ProviderError(
        "Could not reach Anthropic. Please check your internet connection.",
        "anthropic",
        error,
      );
    }

    const data = (await response.json().catch(() => null)) as AnthropicResponse | null;

    if (!response.ok) {
      const message = data?.error?.message ?? `Request failed with status ${response.status}.`;
      throw new ProviderError(`Anthropic error: ${message}`, "anthropic");
    }

    const textBlock = data?.content?.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new ProviderError("Anthropic returned an empty response.", "anthropic");
    }

    return textBlock.text.trim();
  },
};

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
