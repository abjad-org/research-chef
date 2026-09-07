import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  slugify,
  buildFileName,
  renderMarkdown,
  exportSessionToMarkdown,
} from "../src/core/exportSession.js";
import type { ChatMessage } from "../src/types/index.js";

describe("slugify", () => {
  test("lowercases and hyphenates a normal topic", () => {
    assert.equal(slugify("The Impact of AI on Renewable Energy"), "the-impact-of-ai-on-renewable-energy");
  });

  test("strips punctuation and collapses repeated separators", () => {
    assert.equal(slugify("What's up?? -- Testing!!"), "what-s-up-testing");
  });

  test("trims leading and trailing hyphens", () => {
    assert.equal(slugify("  --Hello World--  "), "hello-world");
  });

  test("returns an empty string for input with no alphanumeric characters", () => {
    assert.equal(slugify("!!! ??? ---"), "");
  });

  test("truncates very long topics to 60 characters", () => {
    const longTopic = "a".repeat(200);
    const result = slugify(longTopic);
    assert.equal(result.length, 60);
  });
});

describe("buildFileName", () => {
  test("combines a slug and an ISO-based timestamp with a .md extension", () => {
    const fixedDate = new Date("2026-01-15T10:30:00.000Z");
    const fileName = buildFileName("Climate change", fixedDate);

    assert.match(fileName, /^climate-change-2026-01-15T10-30-00-000Z\.md$/);
  });

  test("falls back to 'research-session' when the topic has no usable characters", () => {
    const fixedDate = new Date("2026-01-15T10:30:00.000Z");
    const fileName = buildFileName("???", fixedDate);

    assert.match(fileName, /^research-session-/);
  });
});

describe("renderMarkdown", () => {
  test("includes the topic as a top-level heading", () => {
    const markdown = renderMarkdown("Space exploration", []);
    assert.match(markdown, /^# Research session: Space exploration/);
  });

  test("renders each message with a role heading and its content", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: "The capital of France is Paris." },
    ];

    const markdown = renderMarkdown("Geography", history);

    assert.match(markdown, /## 🧑 You/);
    assert.match(markdown, /What is the capital of France\?/);
    assert.match(markdown, /## 🤖 AI/);
    assert.match(markdown, /The capital of France is Paris\./);
  });

  test("preserves message order", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "First reply" },
      { role: "user", content: "Second message" },
    ];

    const markdown = renderMarkdown("Ordering test", history);

    const firstIndex = markdown.indexOf("First message");
    const secondIndex = markdown.indexOf("Second message");
    assert.ok(firstIndex < secondIndex, "messages should appear in chronological order");
  });
});

describe("exportSessionToMarkdown (file I/O)", () => {
  let tempDir: string;

  test("writes a Markdown file to the given directory and returns its path", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "research-chef-test-"));

    const history: ChatMessage[] = [
      { role: "user", content: "Tell me about the ocean" },
      { role: "assistant", content: "The ocean covers most of Earth's surface." },
    ];

    const filePath = await exportSessionToMarkdown("Ocean facts", history, tempDir);

    assert.ok(filePath.startsWith(tempDir), "file should be written inside the provided directory");
    assert.match(filePath, /ocean-facts-.*\.md$/);

    const contents = await readFile(filePath, "utf-8");
    assert.match(contents, /# Research session: Ocean facts/);
    assert.match(contents, /Tell me about the ocean/);
    assert.match(contents, /The ocean covers most of Earth's surface\./);
  });

  test("creates the export directory if it doesn't exist yet", async () => {
    const nestedDir = join(tempDir, "nested", "deeper");

    const filePath = await exportSessionToMarkdown("Nested dir test", [], nestedDir);

    const contents = await readFile(filePath, "utf-8");
    assert.match(contents, /# Research session: Nested dir test/);
  });

  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});