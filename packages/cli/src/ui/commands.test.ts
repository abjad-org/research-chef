import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand, describeModelError, SLASH_COMMANDS } from "../src/ui/commands.js";
import type { PromptAdapter } from "../src/ui/commands.js";
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

function makeStubProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    sendMessage: async ({ messages }) => `Echo: ${messages.at(-1)?.content ?? ""}`,
    testConnection: async () => {
      /* no-op success by default */
    },
    ...overrides,
  };
}

/** A unique sentinel used to simulate a cancelled clack prompt. */
const CANCEL_SENTINEL = Symbol("cancelled");

/**
 * Builds a fake PromptAdapter for tests. `textValue`/`confirmValue` are the
 * values the fake prompts resolve to; pass CANCEL_SENTINEL to simulate the
 * user cancelling (Ctrl+C/Esc) the prompt.
 */
function makeFakePrompts(overrides: { textValue?: unknown; confirmValue?: unknown } = {}): PromptAdapter {
  return {
    text: (async () => overrides.textValue) as PromptAdapter["text"],
    confirm: (async () => overrides.confirmValue) as PromptAdapter["confirm"],
    isCancel: ((value: unknown) => value === CANCEL_SENTINEL) as PromptAdapter["isCancel"],
  };
}

describe("handleCommand routing", () => {
  test("/exit returns handled=true and shouldExit=true", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    const result = await handleCommand("/exit", engine);

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.shouldExit, true);
    }
  });

  test("/exit is case-insensitive", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    const result = await handleCommand("/EXIT", engine);

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.shouldExit, true);
    }
  });

  test("/help returns handled=true and shouldExit=false", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    const result = await handleCommand(SLASH_COMMANDS.help, engine);

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.shouldExit, false);
    }
  });

  test("an unrecognized chat message returns handled=false", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    const result = await handleCommand("just a normal chat message", engine);

    assert.equal(result.handled, false);
  });

  test("a message starting with '/' but not a known command is unhandled", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    const result = await handleCommand("/unknown-command", engine);

    assert.equal(result.handled, false);
  });
});

describe("/clear command", () => {
  test("clears history when the user confirms", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    await engine.research("Some topic");
    assert.ok(engine.getVisibleHistory().length > 0);

    const prompts = makeFakePrompts({ confirmValue: true });
    const result = await handleCommand(SLASH_COMMANDS.clear, engine, prompts);

    assert.equal(result.handled, true);
    assert.equal(engine.getVisibleHistory().length, 0);
  });

  test("keeps history when the user declines", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    await engine.research("Some topic");
    const historyBefore = engine.getVisibleHistory().length;

    const prompts = makeFakePrompts({ confirmValue: false });
    await handleCommand(SLASH_COMMANDS.clear, engine, prompts);

    assert.equal(engine.getVisibleHistory().length, historyBefore);
  });

  test("keeps history when the confirm prompt is cancelled", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    await engine.research("Some topic");
    const historyBefore = engine.getVisibleHistory().length;

    const prompts = makeFakePrompts({ confirmValue: CANCEL_SENTINEL });
    await handleCommand(SLASH_COMMANDS.clear, engine, prompts);

    assert.equal(engine.getVisibleHistory().length, historyBefore);
  });
});

describe("/model command", () => {
  test("switches to a new model when verification succeeds", async () => {
    const provider = makeStubProvider({ testConnection: async () => {} });
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    const prompts = makeFakePrompts({ textValue: "gpt-better" });
    await handleCommand(SLASH_COMMANDS.model, engine, prompts);

    assert.equal(engine.getModel(), "gpt-better");
  });

  test("keeps the current model when verification fails", async () => {
    const provider = makeStubProvider({
      testConnection: async ({ model }) => {
        if (model === "bad-model") {
          throw new ProviderError("not available", "openai", "not_found");
        }
      },
    });
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    const prompts = makeFakePrompts({ textValue: "bad-model" });
    await handleCommand(SLASH_COMMANDS.model, engine, prompts);

    assert.equal(engine.getModel(), "gpt-test");
  });

  test("keeps the current model when input is empty", async () => {
    const provider = makeStubProvider();
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    const prompts = makeFakePrompts({ textValue: "   " });
    await handleCommand(SLASH_COMMANDS.model, engine, prompts);

    assert.equal(engine.getModel(), "gpt-test");
  });

  test("keeps the current model when the prompt is cancelled", async () => {
    const provider = makeStubProvider();
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    const prompts = makeFakePrompts({ textValue: CANCEL_SENTINEL });
    await handleCommand(SLASH_COMMANDS.model, engine, prompts);

    assert.equal(engine.getModel(), "gpt-test");
  });

  test("does nothing when the entered model matches the current one", async () => {
    let testConnectionCalls = 0;
    const provider = makeStubProvider({
      testConnection: async () => {
        testConnectionCalls++;
      },
    });
    const engine = new ResearchEngine(provider, makeConfig({ model: "gpt-test" }));

    const prompts = makeFakePrompts({ textValue: "gpt-test" });
    await handleCommand(SLASH_COMMANDS.model, engine, prompts);

    assert.equal(testConnectionCalls, 0, "should not re-verify the model that's already active");
    assert.equal(engine.getModel(), "gpt-test");
  });
});

describe("/save command", () => {
  test("does not throw and returns handled=true when there is no history to save", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());

    // No research() call was made, so history is empty; handleCommand
    // should warn and return without attempting to write a file.
    const result = await handleCommand(SLASH_COMMANDS.save, engine);

    assert.equal(result.handled, true);
  });
});

describe("describeModelError", () => {
  test("gives a plan/account-specific message for not_found errors", () => {
    const error = new ProviderError("model missing", "openai", "not_found");
    const message = describeModelError(error, "gpt-5-exotic", "OpenAI");

    assert.match(message, /isn't available on your OpenAI account or plan/);
    assert.match(message, /gpt-5-exotic/);
  });

  test("includes the original error message for other ProviderError kinds", () => {
    const error = new ProviderError("rate limit hit", "openai", "rate_limited");
    const message = describeModelError(error, "gpt-test", "OpenAI");

    assert.match(message, /rate limit hit/);
  });

  test("gives a generic message for non-ProviderError values", () => {
    const message = describeModelError(new Error("boom"), "gpt-test", "OpenAI");

    assert.match(message, /unexpected error/);
  });
});