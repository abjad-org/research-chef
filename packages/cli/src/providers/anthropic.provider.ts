import type { AiProvider, ChatMessage, WebSource } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { appendSourcesSection } from "../core/citations.js";
import { fetchJsonWithRetry } from "./httpClient.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 2048;

/** Pinned server-tool version for basic native web search with citations. */
export const ANTHROPIC_WEB_SEARCH_TOOL_TYPE = "web_search_20250305";
/** Upper bound on searches per request; keeps cost/latency predictable. */
export const ANTHROPIC_WEB_SEARCH_MAX_USES = 5;
/** Max server-side `pause_turn` continuations before returning what we have. */
const MAX_PAUSE_TURNS = 3;

interface AnthropicCitation {
  type?: string;
  url?: string;
  title?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  citations?: AnthropicCitation[];
  // Encrypted search payloads must be echoed back verbatim on continuations.
  encrypted_content?: string;
  [key: string]: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

/**
 * Adapter for Anthropic's Messages API with native web search always
 * enabled via the `web_search` server tool.
 * Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 */
export const anthropicProvider: AiProvider = {
  async sendMessage({ apiKey, model, messages }): Promise<string> {
    const { system, conversation } = splitSystemPrompt(messages);

    // The server may pause a long search turn (`stop_reason: pause_turn`);
    // continue it by echoing the assistant blocks back verbatim, so search
    // results (including encrypted_content) stay intact.
    let apiMessages: Array<{ role: string; content: unknown }> = [...conversation];
    let finalText = "";
    let allSources: WebSource[] = [];

    for (let turn = 0; turn <= MAX_PAUSE_TURNS; turn++) {
      const result = await fetchJsonWithRetry<AnthropicResponse>(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: apiMessages,
          tools: [
            {
              type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
              name: "web_search",
              max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
            },
          ],
        }),
      });

      if (!result.ok) {
        throw new ProviderError(`Anthropic error: ${result.message}`, "anthropic", result.kind, result.cause);
      }

      const { text, sources } = parseAnthropicContent(result.data.content ?? []);
      if (text) finalText += (finalText ? "\n" : "") + text;
      allSources = [...allSources, ...sources];

      if (result.data.stop_reason === "pause_turn" && turn < MAX_PAUSE_TURNS) {
        apiMessages = [...apiMessages, { role: "assistant", content: result.data.content ?? [] }];
        continue;
      }
      break;
    }

    if (!finalText) {
      throw new ProviderError("Anthropic returned an empty response.", "anthropic", "unknown");
    }

    return appendSourcesSection(finalText.trim(), allSources);
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

/**
 * Pulls assistant text plus `web_search_result_location` citations out of
 * a Messages API content-block list. Server-tool blocks
 * (`server_tool_use`, `web_search_tool_result`) carry no display text and
 * are skipped — the citable text lives on `text` blocks.
 */
export function parseAnthropicContent(blocks: AnthropicContentBlock[]): { text: string; sources: WebSource[] } {
  const texts: string[] = [];
  const sources: WebSource[] = [];

  for (const block of blocks) {
    if (block.type !== "text" || !block.text) continue;
    texts.push(block.text);
    for (const citation of block.citations ?? []) {
      if (citation.type === "web_search_result_location" && citation.url) {
        sources.push({ title: citation.title ?? citation.url, url: citation.url });
      }
    }
  }

  return { text: texts.join("").trim(), sources };
}
