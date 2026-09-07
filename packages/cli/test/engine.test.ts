import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ResearchEngine } from "../src/core/engine.js";
import { ProviderError } from "../src/types/index.js";
import type { AiProvider, SessionConfig, ProviderInfo } from "../src/types/index.js";

function makeProviderInfo(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "openai",
    label: "OpenAI",
    hint: "test hint",
    defaultModel: "gpt-test",
    keyLooksValid: () => true,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    provider: makeProviderInfo(),
    apiKey: "sk-test-key",
    model: "gpt-test",
    ...overrides,
  };
}

/** A stub AiProvider whose behavior can be customized per test. */
function makeStubProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    sendMessage: async ({ messages }) => `Echo: ${messages.at(-1)?.content ?? ""}`,
    testConnection: async () => {
      /* no-op success by default */
    },
    ...overrides,
  };
}

describe("ResearchEngine", () => {
  test("research() sends a kickoff message referencing the topic", async () => {
    const provider = makeStubProvider();
    const engine = new ResearchEngine(provider, makeConfig());

    const reply = await engine.research("Quantum computing");

    assert.match(reply, /Quantum computing/);
    assert.equal(engine.getCurrentTopic(), "Quantum computing");
  });

  test("chat() appends to history so follow-ups have context", async () => {
    const provider = makeStubProvider();
    const engine = new ResearchEngine(provider, makeConfig());

    await engine.research("Topic A");
    await engine.chat("Tell me more");

    const history = engine.getVisibleHistory();
    // user (kickoff), assistant (reply), user (follow-up), assistant (reply)
    assert.equal(history.length, 4);
    assert.equal(history[0]?.role, "user");
    assert.equal(history[2]?.content, "Tell me more");
  });

  test("a failed send() rolls back the optimistic user message", async () => {
    const provider = makeStubProvider({
      sendMessage: async () => {
        throw new ProviderError("boom", "openai", "server");
      },
    });
    const engine = new ResearchEngine(provider, makeConfig());

    await assert.rejects(() => engine.chat("This will fail"));

    // The failed user message should not remain in history.
    assert.equal(engine.getVisibleHistory().length, 0);
  });

  test("a non-ProviderError from the adapter is wrapped in a ProviderError", async () => {
    const provider = makeStubProvider({
      sendMessage: async () => {
        throw new Error("some unexpected failure");
      },
    });
    const engine = new ResearchEngine(provider, makeConfig());

    await assert.rejects(
      () => engine.chat("hi"),
      (error: unknown) => error instanceof ProviderError && error.kind === "unknown",
    );
  });

  test("changeModel() switches the model after a successful test connection", async () => {
    const provider = makeStubProvider({
      testConnection: async ({ model }) => {
        if (model === "bad-model") {
          throw new ProviderError("not available", "openai", "not_found");
        }
      },
    });
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    await engine.changeModel("gpt-better");

    assert.equal(engine.getModel(), "gpt-better");
  });

  test("changeModel() leaves the model unchanged when verification fails", async () => {
    const provider = makeStubProvider({
      testConnection: async ({ model }) => {
        if (model === "bad-model") {
          throw new ProviderError("not available", "openai", "not_found");
        }
      },
    });
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    await assert.rejects(() => engine.changeModel("bad-model"));
    assert.equal(engine.getModel(), "gpt-test", "model should remain the original one");
  });

  test("resetConversation() clears history and resets the topic", async () => {
    const provider = makeStubProvider();
    const engine = new ResearchEngine(provider, makeConfig());

    await engine.research("Some topic");
    assert.ok(engine.getVisibleHistory().length > 0);

    engine.resetConversation();

    assert.equal(engine.getVisibleHistory().length, 0);
    assert.notEqual(engine.getCurrentTopic(), "Some topic");
  });

  test("getProviderInfo() exposes the configured provider metadata", () => {
    const provider = makeStubProvider();
    const info = makeProviderInfo({ label: "Anthropic" });
    const engine = new ResearchEngine(provider, makeConfig({ provider: info }));

    assert.equal(engine.getProviderInfo().label, "Anthropic");
  });
});