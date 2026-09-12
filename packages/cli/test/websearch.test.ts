import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  openAiProvider,
  parseResponsesOutput,
  OPENAI_DEFAULT_BASE_URL,
} from "../src/providers/openai.provider.js";
import { customProvider } from "../src/providers/custom.provider.js";
import { anthropicProvider, parseAnthropicContent } from "../src/providers/anthropic.provider.js";
import { geminiProvider, parseGeminiResponse } from "../src/providers/gemini.provider.js";
import { PROVIDERS } from "../src/providers/registry.js";
import { getCustomProviderDisclaimer } from "../src/ui/setup.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("provider search-capability metadata", () => {
  test("built-ins advertise native search; custom does not", () => {
    const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

    assert.equal(byId.openai?.supportsNativeSearch, true);
    assert.equal(byId.anthropic?.supportsNativeSearch, true);
    assert.equal(byId.gemini?.supportsNativeSearch, true);
    assert.equal(byId.custom?.supportsNativeSearch, false);
  });
});

describe("custom provider disclaimer", () => {
  test("uses the required neutral wording exactly once", () => {
    const disclaimer = getCustomProviderDisclaimer();

    assert.match(disclaimer, /based on the model's training data, not real-time web search/);
  });

  test("is never framed as a limitation", () => {
    const disclaimer = getCustomProviderDisclaimer().toLowerCase();

    for (const banned of ["limitation", "limited", "doesn't support", "not supported", "unable", "cannot", "can't"]) {
      assert.ok(!disclaimer.includes(banned), `disclaimer should not contain "${banned}"`);
    }
  });
});

describe("OpenAI Responses web search", () => {
  test("sends requests to /responses with the web_search tool", async () => {
    let requestedUrl: string | undefined;
    let requestedBody: Record<string, unknown> | undefined;
    global.fetch = (async (url: string, init: RequestInit) => {
      requestedUrl = url;
      requestedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(200, {
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Hello there", annotations: [] }],
          },
        ],
      });
    }) as typeof fetch;

    await openAiProvider.sendMessage({
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(requestedUrl, `${OPENAI_DEFAULT_BASE_URL}/responses`);
    assert.deepEqual((requestedBody?.tools as unknown[])[0], { type: "web_search" });
  });

  test("appends clickable source links from url_citation annotations", async () => {
    global.fetch = (async () =>
      jsonResponse(200, {
        output: [
          { type: "web_search_call", status: "completed" },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Spain won Euro 2024.",
                annotations: [
                  { type: "url_citation", url: "https://www.uefa.com/euro2024", title: "uefa.com" },
                ],
              },
            ],
          },
        ],
      })) as typeof fetch;

    const reply = await openAiProvider.sendMessage({
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      messages: [{ role: "user", content: "Who won Euro 2024?" }],
    });

    assert.match(reply, /Spain won Euro 2024/);
    assert.match(reply, /Sources:/);
    assert.match(reply, /https:\/\/www\.uefa\.com\/euro2024/);
  });

  test("parseResponsesOutput falls back to output_text when needed", () => {
    const { text, sources } = parseResponsesOutput({ output_text: "Fallback text" } as never);

    assert.equal(text, "Fallback text");
    assert.equal(sources.length, 0);
  });
});

describe("Anthropic web search", () => {
  test("includes the web_search server tool on sendMessage", async () => {
    let requestedBody: Record<string, unknown> | undefined;
    global.fetch = (async (_url: string, init: RequestInit) => {
      requestedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(200, {
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
      });
    }) as typeof fetch;

    await anthropicProvider.sendMessage({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hi" }],
    });

    const tools = requestedBody?.tools as Array<Record<string, unknown>>;
    assert.equal(tools.length, 1);
    assert.match(String(tools[0]?.type), /web_search/);
  });

  test("appends source links from web_search_result_location citations", async () => {
    global.fetch = (async () =>
      jsonResponse(200, {
        content: [
          { type: "server_tool_use", name: "web_search" },
          {
            type: "text",
            text: "Claude can search the web.",
            citations: [
              {
                type: "web_search_result_location",
                url: "https://platform.claude.com/docs/search",
                title: "Web search docs",
              },
            ],
          },
        ],
        stop_reason: "end_turn",
      })) as typeof fetch;

    const reply = await anthropicProvider.sendMessage({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "Does Claude search the web?" }],
    });

    assert.match(reply, /Claude can search the web/);
    assert.match(reply, /Sources:/);
    assert.match(reply, /https:\/\/platform\.claude\.com\/docs\/search/);
  });

  test("parseAnthropicContent skips server-tool blocks", () => {
    const { text, sources } = parseAnthropicContent([
      { type: "server_tool_use", name: "web_search" } as never,
      {
        type: "text",
        text: "Answer.",
        citations: [{ type: "web_search_result_location", url: "https://example.com", title: "Example" }],
      },
    ]);

    assert.equal(text, "Answer.");
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.url, "https://example.com");
  });
});

describe("Gemini Google Search grounding", () => {
  test("includes the google_search tool on sendMessage", async () => {
    let requestedBody: Record<string, unknown> | undefined;
    global.fetch = (async (_url: string, init: RequestInit) => {
      requestedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
      });
    }) as typeof fetch;

    await geminiProvider.sendMessage({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.deepEqual(requestedBody?.tools, [{ google_search: {} }]);
  });

  test("appends source links from groundingChunks", async () => {
    global.fetch = (async () =>
      jsonResponse(200, {
        candidates: [
          {
            content: { parts: [{ text: "Spain won Euro 2024." }] },
            groundingMetadata: {
              groundingChunks: [{ web: { uri: "https://www.uefa.com/euro2024", title: "UEFA Euro 2024" } }],
            },
          },
        ],
      })) as typeof fetch;

    const reply = await geminiProvider.sendMessage({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "Who won Euro 2024?" }],
    });

    assert.match(reply, /Spain won Euro 2024/);
    assert.match(reply, /Sources:/);
    assert.match(reply, /https:\/\/www\.uefa\.com\/euro2024/);
  });

  test("parseGeminiResponse handles responses without grounding metadata", () => {
    const { text, sources } = parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "Just text" }] } }],
    });

    assert.equal(text, "Just text");
    assert.equal(sources.length, 0);
  });
});

describe("custom provider (no native search)", () => {
  test("still uses Chat Completions and sends no search tools", async () => {
    let requestedUrl: string | undefined;
    let requestedBody: Record<string, unknown> | undefined;
    global.fetch = (async (url: string, init: RequestInit) => {
      requestedUrl = url;
      requestedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(200, { choices: [{ message: { content: "Hello there" } }] });
    }) as typeof fetch;

    const reply = await customProvider.sendMessage({
      apiKey: "test-key",
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
      baseUrl: "http://localhost:11434/v1",
    });

    assert.equal(requestedUrl, "http://localhost:11434/v1/chat/completions");
    assert.equal((requestedBody as Record<string, unknown>).tools, undefined);
    assert.equal(reply, "Hello there");
  });
});
