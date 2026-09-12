import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isUsableUrl,
  deduplicateSources,
  formatSourcesSection,
  appendSourcesSection,
} from "../src/core/citations.js";

describe("isUsableUrl", () => {
  test("accepts http and https URLs", () => {
    assert.equal(isUsableUrl("https://example.com/a"), true);
    assert.equal(isUsableUrl("http://example.com/a"), true);
  });

  test("rejects empty, relative, and non-http URLs", () => {
    assert.equal(isUsableUrl(undefined), false);
    assert.equal(isUsableUrl(""), false);
    assert.equal(isUsableUrl("not a url"), false);
    assert.equal(isUsableUrl("ftp://example.com/file"), false);
    assert.equal(isUsableUrl("/relative/path"), false);
  });
});

describe("deduplicateSources", () => {
  test("drops entries without usable URLs", () => {
    const result = deduplicateSources([
      { title: "Good", url: "https://example.com/a" },
      { title: "Bad", url: "not a url" },
      { title: "Empty", url: "" },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.url, "https://example.com/a");
  });

  test("dedupes by URL (case-insensitive) keeping first occurrence", () => {
    const result = deduplicateSources([
      { title: "First", url: "https://example.com/A" },
      { title: "Second", url: "https://example.com/a" },
      { title: "Other", url: "https://example.com/b" },
    ]);

    assert.equal(result.length, 2);
    assert.equal(result[0]?.title, "First");
    assert.equal(result[1]?.url, "https://example.com/b");
  });

  test("falls back to the URL when the title is blank", () => {
    const result = deduplicateSources([{ title: "   ", url: "https://example.com/x" }]);

    assert.equal(result[0]?.title, "https://example.com/x");
  });
});

describe("formatSourcesSection", () => {
  test("returns an empty string when there are no usable sources", () => {
    assert.equal(formatSourcesSection([]), "");
    assert.equal(formatSourcesSection([{ title: "x", url: "junk" }]), "");
  });

  test("renders numbered entries with full URLs", () => {
    const section = formatSourcesSection([
      { title: "Example A", url: "https://example.com/a" },
      { title: "Example B", url: "https://example.com/b" },
    ]);

    assert.match(section, /^Sources:/);
    assert.match(section, /1\. Example A — https:\/\/example\.com\/a/);
    assert.match(section, /2\. Example B — https:\/\/example\.com\/b/);
  });
});

describe("appendSourcesSection", () => {
  test("appends a sources section to plain report text", () => {
    const out = appendSourcesSection("Here is the report.", [
      { title: "Example", url: "https://example.com" },
    ]);

    assert.match(out, /Here is the report\./);
    assert.match(out, /Sources:/);
    assert.match(out, /https:\/\/example\.com/);
  });

  test("returns text unchanged when there are no sources", () => {
    assert.equal(appendSourcesSection("Report text.", []), "Report text.");
  });

  test("does not duplicate when a sources section already exists", () => {
    const existing = "Report.\n\nSources:\n1. Old — https://old.example.com";
    const out = appendSourcesSection(existing, [{ title: "New", url: "https://new.example.com" }]);

    assert.equal(out, existing);
  });
});
