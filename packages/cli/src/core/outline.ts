/**
 * Report outlines and section navigation.
 *
 * Before a full report is generated, the engine drafts an outline (sections
 * + guiding sub-questions) that the user can approve, edit, or regenerate.
 * After the report lands, it can be split back into navigable sections so
 * `/sections` + `/goto` can jump to any part of a long report.
 */

export interface OutlineSection {
  heading: string;
  description: string;
  subQuestions: string[];
}

export interface ReportOutline {
  topic: string;
  sections: OutlineSection[];
}

export interface ReportSection {
  heading: string;
  body: string;
}

/** Prompt that asks the model for an outline only — no full report yet. */
export function buildOutlinePrompt(topic: string): string {
  return [
    `Draft a research outline for the topic: "${topic}".`,
    "",
    "Break broad topics into focused sub-questions first, then turn them into 3-6 sections.",
    "Reply with ONLY the outline, one section per line, in this exact shape:",
    "1. Section heading — one-sentence description",
    "   - A guiding sub-question for this section?",
    "",
    "Rules: no intro, no conclusion paragraph, no full report — just the numbered sections with their sub-questions.",
  ].join("\n");
}

/** Prompt that asks for the full report following an approved outline. */
export function buildReportFromOutlinePrompt(topic: string, outline: ReportOutline): string {
  const lines = outline.sections.map((section, index) => {
    const subs = section.subQuestions.map((q) => `   - ${q}`).join("\n");
    const desc = section.description ? ` — ${section.description}` : "";
    return `${index + 1}. ${section.heading}${desc}${subs ? `\n${subs}` : ""}`;
  });

  return [
    `Please research the following topic and produce the structured report described in your instructions: "${topic}".`,
    "",
    "Follow this approved outline section by section, using each heading as a section header in your report:",
    ...lines,
  ].join("\n");
}

/**
 * Parses model-produced (or user-edited) outline text into a ReportOutline.
 * Accepts numbered sections (`1.`, `1)`) with optional `—`/`-`/`:` descriptions,
 * plus indented bullet sub-questions (`-`, `*`, `•`) underneath each section.
 */
export function parseOutlineText(topic: string, text: string): ReportOutline {
  const sections: OutlineSection[] = [];
  let current: OutlineSection | undefined;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (sectionMatch) {
      const rest = (sectionMatch[2] ?? "").trim();
      const [headingPart, ...descParts] = rest.split(/\s+[—–-]\s+|:\s+/);
      current = {
        heading: (headingPart ?? "").trim(),
        description: descParts.join(" — ").trim(),
        subQuestions: [],
      };
      if (current.heading) sections.push(current);
      else current = undefined;
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch && current) {
      current.subQuestions.push((bulletMatch[1] ?? "").trim());
    }
  }

  return { topic, sections };
}

/**
 * Parses free-text user edits (single-line friendly: sections separated by
 * `;` or newlines) into outline sections. Returns undefined when nothing
 * usable was typed.
 */
export function parseEditedOutline(topic: string, input: string): ReportOutline | undefined {
  const headings = input
    .split(/[;\n]+/)
    .map((part) => part.trim().replace(/^\d{1,2}[.)]\s+/, ""))
    .filter((part) => part.length > 0);

  if (headings.length === 0) return undefined;

  return {
    topic,
    sections: headings.map((heading) => ({ heading, description: "", subQuestions: [] })),
  };
}

/** Renders an outline as a numbered list with sub-questions for display. */
export function formatOutlineForDisplay(outline: ReportOutline): string {
  if (outline.sections.length === 0) return "(empty outline)";

  const lines: string[] = [];
  outline.sections.forEach((section, index) => {
    const desc = section.description ? ` — ${section.description}` : "";
    lines.push(`${index + 1}. ${section.heading}${desc}`);
    for (const question of section.subQuestions) {
      lines.push(`   - ${question}`);
    }
  });

  return lines.join("\n");
}

/**
 * Splits a full report into navigable sections. Prefers Markdown ATX
 * headings (`## Heading`); falls back to numbered section headings
 * (`1. Heading`); otherwise returns the whole report as one section.
 * A trailing `Sources:` block is metadata, not content, so it is excluded.
 */
export function splitReportSections(report: string): ReportSection[] {
  const withoutSources = stripSourcesBlock(report);
  // ATX headings are unambiguous section markers — even a single one counts.
  const byHeadings = splitOnPattern(withoutSources, /^(#{1,4})\s+(.+?)\s*$/);
  if (byHeadings.length >= 1) return byHeadings;

  // Numbered fallback is deliberately strict (short, no trailing period) so
  // numbered key-point lists inside a report aren't mistaken for sections.
  const byNumbered = splitOnPattern(withoutSources, /^(\d{1,2})[.)]\s+(.+?)\s*$/, isNumberedHeadingLike);
  if (byNumbered.length > 1) return byNumbered;

  return [{ heading: "Full report", body: withoutSources.trim() }];
}

/** Short header-style lines only — filters out long numbered list items. */
function isNumberedHeadingLike(heading: string): boolean {
  const trimmed = heading.trim();
  return trimmed.length > 0 && trimmed.length <= 80 && !trimmed.endsWith(".");
}

function splitOnPattern(
  report: string,
  pattern: RegExp,
  isHeadingLike: (heading: string) => boolean = () => true,
): ReportSection[] {
  const sections: ReportSection[] = [];
  let currentHeading: string | undefined;
  let currentLines: string[] = [];
  const preamble: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (currentHeading && body) {
      sections.push({ heading: currentHeading, body });
    }
    currentLines = [];
  };

  for (const line of report.split("\n")) {
    const match = line.trim().match(pattern);
    if (match && isHeadingLike(match[2] ?? match[0])) {
      flush();
      currentHeading = (match[2] ?? match[0]).trim();
    } else if (currentHeading === undefined) {
      preamble.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // Leading prose before the first heading belongs to the first section.
  const intro = preamble.join("\n").trim();
  if (intro && sections.length > 0) {
    sections[0]!.body = `${intro}\n\n${sections[0]!.body}`;
  }

  return sections;
}

/** Removes a trailing `Sources:` block (appended citations) before splitting. */
function stripSourcesBlock(report: string): string {
  const lines = report.split("\n");
  const idx = lines.findIndex((line) => line.trim().toLowerCase() === "sources:");
  if (idx === -1) return report;
  return lines.slice(0, idx).join("\n");
}

/** Renders a numbered section list plus a `/goto` hint. Pure — unit tested. */
export function formatSectionList(sections: ReportSection[]): string {
  const lines = ["Report sections:", ...sections.map((s, i) => `${i + 1}. ${s.heading}`)];
  lines.push("Type /goto <number> to read a section.");
  return lines.join("\n");
}

/**
 * Resolves a `/goto` argument to a section: 1-based number first, then
 * case-insensitive heading substring. Pure — unit tested.
 */
export function resolveSectionTarget(sections: ReportSection[], arg: string): ReportSection | undefined {
  const trimmed = arg.trim();
  if (!trimmed) return undefined;

  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= sections.length) {
    return sections[asNumber - 1];
  }

  const needle = trimmed.toLowerCase();
  return sections.find((section) => section.heading.toLowerCase().includes(needle));
}
