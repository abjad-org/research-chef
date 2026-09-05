import type { AiProvider, ChatMessage } from "../types/index.js";
import { ProviderError } from "../types/index.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Adapter for OpenAI's Chat Completions API.
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
export const openAiProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    let response: Response;

    try {
      response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: toOpenAiMessages(messages),
          temperature: 0.7,
        }),
      });
    } catch (error) {
      throw new ProviderError(
        "Could not reach OpenAI. Please check your internet connection.",
        "openai",
        error,
      );
    }

    const data = (await response.json().catch(() => null)) as OpenAiChatResponse | null;

    if (!response.ok) {
      const message = data?.error?.message ?? `Request failed with status ${response.status}.`;
      throw new ProviderError(`OpenAI error: ${message}`, "openai");
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError("OpenAI returned an empty response.", "openai");
    }

    return content.trim();
  },
};

function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
