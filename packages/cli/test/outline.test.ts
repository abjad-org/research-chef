import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildOutlinePrompt,
  buildReportFromOutlinePrompt,
  parseOutlineText,
  parseEditedOutline,
  formatOutlineForDisplay,
  splitReportSections,
  formatSectionList,
  resolveSectionTarget,
  type ReportOutline,
} from "../src/core/outline.js";
import { ResearchEngine } from "../src/core/engine.js";
import { runOutlineFlow, type OutlinePrompts } from "../src/ui/outlineFlow.js";
import { handleCommand, SLASH_COMMANDS } from "../src/ui/commands.js";
import { ProviderError } from "../src/types/index.js";
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

/** Fake OutlinePrompts backed by queues of select/text answers. */
function makeOutlinePrompts(selectAnswers: unknown[], textAnswers: unknown[] = []): OutlinePrompts {
  const selects = [...selectAnswers];
  const texts = [...textAnswers];
  return {
    select: (async () => selects.shift()) as OutlinePrompts["select"],
    text: (async () => texts.shift()) as OutlinePrompts["text"],
    isCancel: ((value: unknown) => value === CANCEL_SENTINEL) as OutlinePrompts["isCancel"],
  };
}

const SAMPLE_OUTLINE_TEXT = [
  "1. Background — how the topic came to be",
  "   - What caused it?",
  "   - Who is affected?",
  "2. Key developments — the current state of play",
  "3) Open questions: what remains unresolved",
].join("\n");

describe("outline prompts", () => {
  test("buildOutlinePrompt asks for sections with sub-questions, not a report", () => {
    const prompt = buildOutlinePrompt("Solar sails");

    assert.match(prompt, /Solar sails/);
    assert.match(prompt, /sub-question/i);
    assert.match(prompt, /no full report/i);
  });

  test("buildReportFromOutlinePrompt embeds the approved headings", () => {
    const outline: ReportOutline = {
      topic: "Solar sails",
      sections: [
        { heading: "Background", description: "origins", subQuestions: ["What caused it?"] },
        { heading: "Outlook", description: "", subQuestions: [] },
      ],
    };

    const prompt = buildReportFromOutlinePrompt("Solar sails", outline);

    assert.match(prompt, /Solar sails/);
    assert.match(prompt, /Background/);
    assert.match(prompt, /What caused it\?/);
    assert.match(prompt, /Outlook/);
  });
});

describe("parseOutlineText", () => {
  test("parses numbered sections with descriptions and sub-questions", () => {
    const outline = parseOutlineText("Topic", SAMPLE_OUTLINE_TEXT);

    assert.equal(outline.sections.length, 3);
    assert.equal(outline.sections[0]?.heading, "Background");
    assert.equal(outline.sections[0]?.description, "how the topic came to be");
    assert.deepEqual(outline.sections[0]?.subQuestions, ["What caused it?", "Who is affected?"]);
    assert.equal(outline.sections[2]?.heading, "Open questions");
    assert.equal(outline.sections[2]?.description, "what remains unresolved");
  });

  test("ignores bullets before the first section and blank lines", () => {
    const outline = parseOutlineText("Topic", "- stray bullet\n\n1. Only section");

    assert.equal(outline.sections.length, 1);
    assert.equal(outline.sections[0]?.heading, "Only section");
  });

  test("returns zero sections for prose without numbered lines", () => {
    assert.equal(parseOutlineText("Topic", "Just some prose.").sections.length, 0);
  });
});

describe("parseEditedOutline", () => {
  test("splits semicolon-separated headings and strips numbering", () => {
    const outline = parseEditedOutline("Topic", "1. Background; Key developments ;Open questions");

    assert.ok(outline);
    assert.deepEqual(
      outline?.sections.map((s) => s.heading),
      ["Background", "Key developments", "Open questions"],
    );
  });

  test("returns undefined for blank input", () => {
    assert.equal(parseEditedOutline("Topic", "   ;  "), undefined);
  });
});

describe("formatOutlineForDisplay", () => {
  test("renders numbered sections with sub-questions", () => {
    const out = formatOutlineForDisplay(parseOutlineText("Topic", SAMPLE_OUTLINE_TEXT));

    assert.match(out, /1\. Background/);
    assert.match(out, /- What caused it\?/);
  });

  test("handles an empty outline without throwing", () => {
    assert.match(formatOutlineForDisplay({ topic: "T", sections: [] }), /empty outline/);
  });
});

describe("splitReportSections", () => {
  test("splits on Markdown headings and keeps preamble in the first section", () => {
    const report = ["Intro prose.", "", "## Background", "", "Some background.", "", "## Outlook", "", "The future."].join("\n");

    const sections = splitReportSections(report);

    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.heading, "Background");
    assert.match(sections[0]?.body ?? "", /Intro prose/);
    assert.match(sections[0]?.body ?? "", /Some background/);
    assert.equal(sections[1]?.heading, "Outlook");
  });

  test("falls back to numbered headings for non-markdown reports", () => {
    const report = ["1. Background", "Text one.", "2. Outlook", "Text two."].join("\n");

    const sections = splitReportSections(report);

    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.heading, "Background");
  });

  test("does not mistake long numbered list items for sections", () => {
    const report = [
      "## Key points",
      "1. This is a very long numbered key point that goes on and on with lots of detail about the topic at hand.",
      "2. Another equally long numbered key point with plenty of explanation and a trailing period.",
    ].join("\n");

    const sections = splitReportSections(report);

    assert.equal(sections.length, 1);
  });

  test("returns the whole report when no headings exist", () => {
    const sections = splitReportSections("Just a short report.");

    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.heading, "Full report");
  });

  test("excludes the trailing Sources block from navigation", () => {
    const report = ["## A", "Body A.", "## B", "Body B.", "", "Sources:", "1. X — https://example.com"].join("\n");

    const sections = splitReportSections(report);

    assert.ok(sections.every((s) => s.heading !== "Sources:"));
    assert.equal(sections.length, 2);
  });
});

describe("formatSectionList / resolveSectionTarget", () => {
  const sections = [
    { heading: "Background", body: "b" },
    { heading: "Outlook", body: "o" },
  ];

  test("lists sections with a /goto hint", () => {
    const out = formatSectionList(sections);

    assert.match(out, /1\. Background/);
    assert.match(out, /\/goto <number>/);
  });

  test("resolves numbers and heading substrings", () => {
    assert.equal(resolveSectionTarget(sections, "2")?.heading, "Outlook");
    assert.equal(resolveSectionTarget(sections, "look")?.heading, "Outlook");
  });

  test("returns undefined for missing/out-of-range args", () => {
    assert.equal(resolveSectionTarget(sections, ""), undefined);
    assert.equal(resolveSectionTarget(sections, "9"), undefined);
    assert.equal(resolveSectionTarget(sections, "nope"), undefined);
  });
});

describe("ResearchEngine outline + last report", () => {
  test("generateOutline parses the provider reply without touching history", async () => {
    const provider = makeStubProvider({
      sendMessage: async () => SAMPLE_OUTLINE_TEXT,
    });
    const engine = new ResearchEngine(provider, makeConfig());

    const outline = await engine.generateOutline("Topic");

    assert.equal(outline.sections.length, 3);
    assert.equal(engine.getVisibleHistory().length, 0);
    assert.equal(engine.getLastReport(), undefined);
  });

  test("generateOutline throws when the reply has no sections", async () => {
    const provider = makeStubProvider({ sendMessage: async () => "Just prose." });
    const engine = new ResearchEngine(provider, makeConfig());

    await assert.rejects(() => engine.generateOutline("Topic"), ProviderError);
  });

  test("generateOutline wraps unexpected errors in a ProviderError", async () => {
    const provider = makeStubProvider({
      sendMessage: async () => { throw new Error("boom"); },
    });
    const engine = new ResearchEngine(provider, makeConfig());

    await assert.rejects(
      () => engine.generateOutline("Topic"),
      (e: unknown) => e instanceof ProviderError && e.kind === "unknown",
    );
  });

  test("researchWithOutline sends the approved headings and tracks the report", async () => {
    let sentMessages: unknown[] = [];
    const provider = makeStubProvider({
      sendMessage: async ({ messages }) => {
        sentMessages = messages;
        return "## Background\n\nFull report body.";
      },
    });
    const engine = new ResearchEngine(provider, makeConfig());
    const outline = parseOutlineText("Topic", SAMPLE_OUTLINE_TEXT);

    const report = await engine.researchWithOutline("Topic", outline);

    assert.match(report, /Full report body/);
    assert.equal(engine.getCurrentTopic(), "Topic");
    assert.equal(engine.getLastReport(), report);
    assert.match(JSON.stringify(sentMessages), /Background/);
  });

  test("research() tracks the report; reset clears it; restore revives it", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());

    await engine.research("Topic A");
    assert.ok(engine.getLastReport());

    engine.resetConversation();
    assert.equal(engine.getLastReport(), undefined);

    engine.restoreSession("Topic B", [
      { role: "user", content: "q" },
      { role: "assistant", content: "revived report" },
    ]);
    assert.equal(engine.getLastReport(), "revived report");
  });
});

describe("runOutlineFlow", () => {
  test("approve returns the drafted outline", async () => {
    const engine = new ResearchEngine(
      makeStubProvider({ sendMessage: async () => SAMPLE_OUTLINE_TEXT }),
      makeConfig(),
    );

    const result = await runOutlineFlow(engine, "Topic", makeOutlinePrompts(["approve"]));

    assert.equal(result.status, "approved");
    assert.equal(result.outline?.sections.length, 3);
  });

  test("edit replaces the outline with the user's headings", async () => {
    const engine = new ResearchEngine(
      makeStubProvider({ sendMessage: async () => SAMPLE_OUTLINE_TEXT }),
      makeConfig(),
    );

    const result = await runOutlineFlow(engine, "Topic", makeOutlinePrompts(["edit", "approve"], ["Mine; Yours"]));

    assert.equal(result.status, "approved");
    assert.deepEqual(
      result.outline?.sections.map((s) => s.heading),
      ["Mine", "Yours"],
    );
  });

  test("an empty edit keeps the previous outline", async () => {
    const engine = new ResearchEngine(
      makeStubProvider({ sendMessage: async () => SAMPLE_OUTLINE_TEXT }),
      makeConfig(),
    );

    const result = await runOutlineFlow(engine, "Topic", makeOutlinePrompts(["edit", "approve"], ["   "]));

    assert.equal(result.status, "approved");
    assert.equal(result.outline?.sections.length, 3);
  });

  test("regenerate drafts again before approving", async () => {
    let calls = 0;
    const engine = new ResearchEngine(
      makeStubProvider({
        sendMessage: async () => {
          calls++;
          return calls === 1 ? SAMPLE_OUTLINE_TEXT : "1. Fresh take";
        },
      }),
      makeConfig(),
    );

    const result = await runOutlineFlow(engine, "Topic", makeOutlinePrompts(["regenerate", "approve"]));

    assert.equal(result.status, "approved");
    assert.equal(calls, 2);
    assert.deepEqual(result.outline?.sections.map((s) => s.heading), ["Fresh take"]);
  });

  test("a drafting failure returns skipped so callers can fall back", async () => {
    const engine = new ResearchEngine(
      makeStubProvider({
        sendMessage: async () => { throw new ProviderError("down", "openai", "server"); },
      }),
      makeConfig(),
    );

    const result = await runOutlineFlow(engine, "Topic", makeOutlinePrompts(["approve"]));

    assert.equal(result.status, "skipped");
    assert.equal(result.outline, undefined);
  });
});

describe("/sections and /goto commands", () => {
  async function engineWithReport(): Promise<ResearchEngine> {
    const engine = new ResearchEngine(
      makeStubProvider({ sendMessage: async () => "## Background\n\nBody text." }),
      makeConfig(),
    );
    await engine.research("Topic");
    return engine;
  }

  test("/sections and /goto <number> are handled", async () => {
    const engine = await engineWithReport();

    assert.equal((await handleCommand(SLASH_COMMANDS.sections, engine)).handled, true);
    assert.equal((await handleCommand("/goto 1", engine)).handled, true);
  });

  test("/goto resolves heading substrings", async () => {
    const engine = await engineWithReport();

    assert.equal((await handleCommand("/goto back", engine)).handled, true);
  });

  test("/sections and /goto warn gracefully with no report", async () => {
    const engine = new ResearchEngine(makeStubProvider(), makeConfig());

    assert.equal((await handleCommand(SLASH_COMMANDS.sections, engine)).handled, true);
    assert.equal((await handleCommand("/goto 1", engine)).handled, true);
    assert.equal((await handleCommand("/goto", engine)).handled, true);
  });

  test("/goto with an unknown section is handled without throwing", async () => {
    const engine = await engineWithReport();

    assert.equal((await handleCommand("/goto 99", engine)).handled, true);
  });
});
