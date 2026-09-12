import type { WebSource } from "../types/index.js";

/**
 * Shared helpers for turning provider-native search citations into the
 * clickable, verifiable "Sources:" section appended to every research
 * report. Provider adapters extract raw {title, url} pairs from their own
 * API shapes; everything here is provider-agnostic.
 */

const SOURCES_HEADING = "Sources:";

/** Returns true for strings that are usable, absolute http(s) URLs. */
export function isUsableUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Deduplicates sources by normalized URL, drops entries without a usable
 * http(s) URL, and trims titles (falling back to the URL itself when the
 * title is empty). Order of first appearance is preserved.
 */
export function deduplicateSources(sources: WebSource[]): WebSource[] {
  const seen = new Set<string>();
  const result: WebSource[] = [];

  for (const source of sources) {
    const url = source.url.trim();
    if (!isUsableUrl(url)) continue;

    const normalized = url.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const title = source.title.trim();
    result.push({ title: title.length > 0 ? title : url, url });
  }

  return result;
}

/**
 * Renders a Markdown-friendly sources section with one numbered entry per
 * source. URLs are printed in full (not hidden behind link text alone) so
 * they stay clickable in plain terminals and verifiable in exported files.
 */
export function formatSourcesSection(sources: WebSource[]): string {
  const unique = deduplicateSources(sources);
  if (unique.length === 0) return "";

  const lines = [SOURCES_HEADING];
  unique.forEach((source, index) => {
    lines.push(`${index + 1}. ${source.title} — ${source.url}`);
  });

  return lines.join("\n");
}

/**
 * Appends a "Sources:" section to report text. Returns the text unchanged
 * when there are no usable sources or when it already ends with (or
 * contains) a sources section, so adapters can call this unconditionally
 * without risking duplicates.
 */
export function appendSourcesSection(reportText: string, sources: WebSource[]): string {
  const section = formatSourcesSection(sources);
  if (!section) return reportText;

  if (reportText.includes(SOURCES_HEADING)) return reportText;

  return `${reportText.trimEnd()}\n\n${section}`;
}
