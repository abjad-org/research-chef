import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionStore,
  buildSessionId,
  isSafeSessionId,
  persistCurrentSession,
} from "../src/core/sessionStore.js";
import { ResearchEngine } from "../src/core/engine.js";
import {
  handleCommand,
  formatSessionList,
  resolveResumeTarget,
  SLASH_COMMANDS,
  type PromptAdapter,
} from "../src/ui/commands.js";
import { buildStartupChoices, START_NEW_VALUE } from "../src/ui/resumeStartup.js";
import type { AiProvider, SessionConfig, ProviderInfo } from "../src/types/index.js";

function makeProviderInfo(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "openai",
    label: "OpenAI",
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
    testConnection: async () => {},
    ...overrides,
  };
}

const CANCEL_SENTINEL = Symbol("cancelled");

function makeFakePrompts(overrides: { textValue?: unknown; confirmValue?: unknown } = {}): PromptAdapter {
  return {
    text: (async () => overrides.textValue) as PromptAdapter["text"],
    confirm: (async () => overrides.confirmValue) as PromptAdapter["confirm"],
    isCancel: ((value: unknown) => value === CANCEL_SENTINEL) as PromptAdapter["isCancel"],
  };
}

describe("buildSessionId / isSafeSessionId", () => {
  test("builds a timestamped, slugged id", () => {
    const id = buildSessionId("Climate change!", new Date("2026-01-15T10:30:00.000Z"));

    assert.match(id, /^2026-01-15T10-30-00-000Z-climate-change$/);
  });

  test("falls back to a generic slug for punctuation-only topics", () => {
    const id = buildSessionId("???", new Date("2026-01-15T10:30:00.000Z"));

    assert.match(id, /research-session$/);
  });

  test("rejects traversal and absolute paths", () => {
    assert.equal(isSafeSessionId("../evil"), false);
    assert.equal(isSafeSessionId("/abs/path"), false);
    assert.equal(isSafeSessionId(""), false);
    assert.equal(isSafeSessionId("2026-01-01T00-00-00-000Z-topic"), true);
  });
});

describe("SessionStore file round-trip", () => {
  let tempDir: string;
  let store: SessionStore;

  test("setup temp store", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "research-chef-sessions-"));
    store = new SessionStore(tempDir);
  });

  test("save() creates a readable session file", async () => {
    const saved = await store.save({
      topic: "Ocean facts",
      providerId: "openai",
      model: "gpt-test",
      messages: [
        { role: "user", content: "Tell me about the ocean" },
        { role: "assistant", content: "The ocean is vast." },
      ],
    });

    assert.ok(saved.id.length > 0);

    const loaded = await store.load(saved.id);
    assert.equal(loaded?.topic, "Ocean facts");
    assert.equal(loaded?.messages.length, 2);
  });

  test("save() with the same id updates in place and preserves createdAt", async () => {
    const first = await store.save({
      topic: "Topic A",
      providerId: "openai",
      model: "gpt-test",
      messages: [{ role: "user", content: "one" }],
    });

    const second = await store.save({
      id: first.id,
      topic: "Topic A",
      providerId: "openai",
      model: "gpt-test",
      messages: [
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
      ],
    });

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.messages.length, 2);
    assert.ok(second.updatedAt >= first.updatedAt);
  });

  test("list() returns newest first and skips corrupt files", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tempDir, "corrupt.json"), "not json{{{", "utf-8");

    const summaries = await store.list();

    assert.ok(summaries.length >= 2);
    assert.ok(summaries[0]!.updatedAt >= summaries[1]!.updatedAt);
    assert.ok(summaries.every((s) => s.id !== "corrupt"));
  });

  test("search() filters by topic case-insensitively", async () => {
    const matches = await store.search("ocean");
    assert.ok(matches.length >= 1);
    assert.ok(matches.every((s) => s.topic.toLowerCase().includes("ocean")));

    const all = await store.search("   ");
    const listed = await store.list();
    assert.equal(all.length, listed.length);

    const none = await store.search("zzz-no-such-topic-zzz");
    assert.equal(none.length, 0);
  });

  test("load() returns undefined for unknown or unsafe ids", async () => {
    assert.equal(await store.load("does-not-exist"), undefined);
    assert.equal(await store.load("../evil"), undefined);
  });

  test("list() on a missing directory returns an empty array", async () => {
    const empty = await new SessionStore(join(tempDir, "nope", "missing")).list();
    assert.deepEqual(empty, []);
  });

  after(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });
});

describe("persistCurrentSession (auto-save)", () => {
  test("creates a file on first call and updates the same file afterwards", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-autosave-"));
    try {
      const store = new SessionStore(tempDir);
      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      await engine.research("Auto-save topic");

      const first = await persistCurrentSession(store, engine);
      assert.ok(first?.id);
      assert.equal(engine.getSessionId(), first?.id);

      await engine.chat("Follow-up");
      const second = await persistCurrentSession(store, engine);
      assert.equal(second?.id, first?.id);
      assert.equal(second?.messages.length, 4);

      const listed = await store.list();
      assert.equal(listed.length, 1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns undefined when there is nothing to save", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-autosave-empty-"));
    try {
      const store = new SessionStore(tempDir);
      const engine = new ResearchEngine(makeStubProvider(), makeConfig());

      assert.equal(await persistCurrentSession(store, engine), undefined);
      assert.deepEqual(await store.list(), []);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("never throws when the store fails", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    await engine.research("Topic");

    const broken = { save: async () => { throw new Error("disk on fire"); } } as unknown as SessionStore;
    assert.equal(await persistCurrentSession(broken, engine), undefined);
  });
});

describe("ResearchEngine.restoreSession", () => {
  test("restores topic, messages, and session id", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());
    await engine.research("Original topic");

    engine.restoreSession("Restored topic", [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
    ], "session-123");

    assert.equal(engine.getCurrentTopic(), "Restored topic");
    assert.equal(engine.getSessionId(), "session-123");
    const history = engine.getVisibleHistory();
    assert.equal(history.length, 2);
    assert.equal(history[0]?.content, "q1");
  });

  test("drops system-role messages and resets the session id on clear", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());

    engine.restoreSession("T", [
      { role: "system", content: "should be dropped" },
      { role: "user", content: "q" },
    ], "abc");

    assert.equal(engine.getVisibleHistory().length, 1);

    engine.resetConversation();
    assert.equal(engine.getSessionId(), undefined);
  });
});

describe("formatSessionList / resolveResumeTarget", () => {
  const summaries = [
    { id: "id-b", topic: "Second", providerId: "openai", model: "m", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", messageCount: 4 },
    { id: "id-a", topic: "First", providerId: "openai", model: "m", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", messageCount: 1 },
  ];

  test("numbers entries newest-first with a resume hint", () => {
    const out = formatSessionList(summaries);

    assert.match(out, /Past sessions/);
    assert.match(out, /1\. Second/);
    assert.match(out, /2\. First/);
    assert.match(out, /\/resume <number>/);
  });

  test("includes the filter query in the heading when filtering", () => {
    const out = formatSessionList(summaries.slice(0, 1), "seco");

    assert.match(out, /matching "seco"/);
  });

  test("resolves 1-based numbers and raw ids", () => {
    assert.equal(resolveResumeTarget(summaries, "1")?.id, "id-b");
    assert.equal(resolveResumeTarget(summaries, "2")?.id, "id-a");
    assert.equal(resolveResumeTarget(summaries, "id-a")?.id, "id-a");
  });

  test("returns undefined for missing/out-of-range args", () => {
    assert.equal(resolveResumeTarget(summaries, ""), undefined);
    assert.equal(resolveResumeTarget(summaries, "0"), undefined);
    assert.equal(resolveResumeTarget(summaries, "99"), undefined);
    assert.equal(resolveResumeTarget(summaries, "nope"), undefined);
  });
});

describe("buildStartupChoices", () => {
  test("always starts with a fresh-session option", () => {
    const choices = buildStartupChoices([]);

    assert.equal(choices.length, 1);
    assert.equal(choices[0]?.value, START_NEW_VALUE);
  });

  test("caps the list at 8 recent sessions", () => {
    const summaries = Array.from({ length: 12 }, (_, i) => ({
      id: `id-${i}`,
      topic: `Topic ${i}`,
      providerId: "openai",
      model: "m",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messageCount: 2,
    }));

    const choices = buildStartupChoices(summaries);

    assert.equal(choices.length, 9);
    assert.equal(choices[0]?.value, START_NEW_VALUE);
  });
});

describe("/history and /resume commands", () => {
  test("/history is handled even with no sessions", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-cmd-"));
    try {
      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      const result = await handleCommand(SLASH_COMMANDS.history, engine, makeFakePrompts(), new SessionStore(tempDir));

      assert.equal(result.handled, true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("/history with a filter is handled", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-cmd-"));
    try {
      const store = new SessionStore(tempDir);
      await store.save({ topic: "Climate", providerId: "openai", model: "m", messages: [{ role: "user", content: "q" }] });

      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      const result = await handleCommand("/history climate", engine, makeFakePrompts(), store);

      assert.equal(result.handled, true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("/resume loads the chosen session into the engine", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-cmd-"));
    try {
      const store = new SessionStore(tempDir);
      await store.save({
        topic: "Saved topic",
        providerId: "openai",
        model: "m",
        messages: [
          { role: "user", content: "saved-q" },
          { role: "assistant", content: "saved-a" },
        ],
      });

      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      const result = await handleCommand("/resume 1", engine, makeFakePrompts(), store);

      assert.equal(result.handled, true);
      assert.equal(engine.getCurrentTopic(), "Saved topic");
      assert.equal(engine.getVisibleHistory().length, 2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("/resume asks for confirmation when current work exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-cmd-"));
    try {
      const store = new SessionStore(tempDir);
      await store.save({
        topic: "Saved topic",
        providerId: "openai",
        model: "m",
        messages: [{ role: "user", content: "saved-q" }],
      });

      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      await engine.research("Current work");

      // Decline: keep current conversation.
      await handleCommand("/resume 1", engine, makeFakePrompts({ confirmValue: false }), store);
      assert.equal(engine.getCurrentTopic(), "Current work");

      // Confirm: replace with the saved session.
      await handleCommand("/resume 1", engine, makeFakePrompts({ confirmValue: true }), store);
      assert.equal(engine.getCurrentTopic(), "Saved topic");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("/resume with a bad index is handled without throwing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "research-chef-cmd-"));
    try {
      const store = new SessionStore(tempDir);
      await store.save({ topic: "T", providerId: "openai", model: "m", messages: [{ role: "user", content: "q" }] });

      const engine = new ResearchEngine(makeStubProvider(), makeConfig());
      const result = await handleCommand("/resume 99", engine, makeFakePrompts(), store);

      assert.equal(result.handled, true);
      assert.equal(engine.getVisibleHistory().length, 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
