import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiCompatibleProvider, openAiProvider, OPENAI_DEFAULT_BASE_URL } from "../src/providers/openai.provider.js";
import { customProvider } from "../src/providers/custom.provider.js";
import { ProviderError } from "../src/types/index.js";

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

function successBody() {
  return { choices: [{ message: { content: "Hello there" } }] };
}

describe("openAiProvider (built-in, Responses API with web search)", () => {
  test("sends requests to OpenAI's Responses endpoint with the web_search tool", async () => {
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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(requestedUrl, `${OPENAI_DEFAULT_BASE_URL}/responses`);
    assert.deepEqual((requestedBody?.tools as unknown[])[0], { type: "web_search" });
  });

  test("includes a Bearer authorization header when a key is provided", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = (async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
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
      apiKey: "sk-test-key",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(capturedHeaders?.Authorization, "Bearer sk-test-key");
  });
});

describe("customProvider (OpenAI-compatible, user-supplied endpoint)", () => {
  test("sends requests to the caller-supplied baseUrl", async () => {
    let requestedUrl: string | undefined;
    global.fetch = (async (url: string) => {
      requestedUrl = url;
      return jsonResponse(200, successBody());
    }) as typeof fetch;

    await customProvider.sendMessage({
      apiKey: "test-key",
      model: "llama-3.3-70b",
      messages: [{ role: "user", content: "hi" }],
      baseUrl: "https://api.groq.com/openai/v1",
    });

    assert.equal(requestedUrl, "https://api.groq.com/openai/v1/chat/completions");
  });

  test("strips a trailing slash from the base URL before appending the path", async () => {
    let requestedUrl: string | undefined;
    global.fetch = (async (url: string) => {
      requestedUrl = url;
      return jsonResponse(200, successBody());
    }) as typeof fetch;

    await customProvider.sendMessage({
      apiKey: "test-key",
      model: "some-model",
      messages: [{ role: "user", content: "hi" }],
      baseUrl: "http://localhost:11434/v1/",
    });

    assert.equal(requestedUrl, "http://localhost:11434/v1/chat/completions");
  });

  test("omits the Authorization header when the API key is empty (e.g. local Ollama)", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = (async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return jsonResponse(200, successBody());
    }) as typeof fetch;

    await customProvider.sendMessage({
      apiKey: "",
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
      baseUrl: "http://localhost:11434/v1",
    });

    assert.equal(capturedHeaders?.Authorization, undefined);
  });

  test("throws a clear ProviderError when no base URL is configured at all", async () => {
    await assert.rejects(
      () =>
        customProvider.sendMessage({
          apiKey: "test-key",
          model: "some-model",
          messages: [{ role: "user", content: "hi" }],
          // no baseUrl provided, and the custom provider has no default
        }),
      (error: unknown) => error instanceof ProviderError && /No endpoint URL was configured/.test(error.message),
    );
  });

  test("labels errors with the 'custom' provider id, not 'openai'", async () => {
    global.fetch = (async () => jsonResponse(401, { error: { message: "bad key" } })) as typeof fetch;

    await assert.rejects(
      () =>
        customProvider.sendMessage({
          apiKey: "bad-key",
          model: "some-model",
          messages: [{ role: "user", content: "hi" }],
          baseUrl: "https://example.com/v1",
        }),
      (error: unknown) => error instanceof ProviderError && error.providerId === "custom" && error.kind === "auth",
    );
  });
});

describe("createOpenAiCompatibleProvider", () => {
  test("falls back to the factory's default base URL when none is passed per-request", async () => {
    let requestedUrl: string | undefined;
    global.fetch = (async (url: string) => {
      requestedUrl = url;
      return jsonResponse(200, successBody());
    }) as typeof fetch;

    const provider = createOpenAiCompatibleProvider("custom", "https://my-default.example.com/v1");

    await provider.sendMessage({
      apiKey: "key",
      model: "model",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(requestedUrl, "https://my-default.example.com/v1/chat/completions");
  });

  test("a per-request baseUrl overrides the factory's default", async () => {
    let requestedUrl: string | undefined;
    global.fetch = (async (url: string) => {
      requestedUrl = url;
      return jsonResponse(200, successBody());
    }) as typeof fetch;

    const provider = createOpenAiCompatibleProvider("custom", "https://default.example.com/v1");

    await provider.sendMessage({
      apiKey: "key",
      model: "model",
      messages: [{ role: "user", content: "hi" }],
      baseUrl: "https://override.example.com/v1",
    });

    assert.equal(requestedUrl, "https://override.example.com/v1/chat/completions");
  });
});