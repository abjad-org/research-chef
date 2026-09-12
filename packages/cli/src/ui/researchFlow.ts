import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { SessionStore, persistCurrentSession } from "../core/sessionStore.js";
import { formatSectionList, resolveSectionTarget, splitReportSections } from "../core/outline.js";
import { ProviderError } from "../types/index.js";
import { renderError, renderResearchReport, renderReportSection } from "./render.js";
import type { OutlinePrompts } from "./outlineFlow.js";
import { runOutlineFlow } from "./outlineFlow.js";

const RESEARCH_STAGES = [
  "Gathering sources...",
  "Cross-checking facts...",
  "Organizing key points...",
  "Polishing the summary...",
];

/**
 * Runs the structured research flow: first an outline the user approves (or
 * edits/regenerates), then the full report following that outline, rendered
 * and auto-saved. Falls back to a direct report when outline drafting fails.
 * Returns whether the research succeeded.
 */
export async function runResearchFlow(
  engine: ResearchEngine,
  topic: string,
  sessionStore: SessionStore = new SessionStore(),
  outlinePrompts?: OutlinePrompts,
): Promise<boolean> {
  const outlineResult = outlinePrompts
    ? await runOutlineFlow(engine, topic, outlinePrompts)
    : await runOutlineFlow(engine, topic);

  const spinner = clack.spinner();
  spinner.start(RESEARCH_STAGES[0]);

  const stageInterval = setInterval(() => {
    const stage = RESEARCH_STAGES[Math.floor(Math.random() * RESEARCH_STAGES.length)];
    spinner.message(stage);
  }, 900);

  try {
    const report =
      outlineResult.status === "approved" && outlineResult.outline
        ? await engine.researchWithOutline(topic, outlineResult.outline)
        : await engine.research(topic);
    clearInterval(stageInterval);
    spinner.stop("Research complete.");

    renderResearchReport(topic, report);
    renderSectionHint(report);
    // Auto-save so the session survives even if the user never runs /save.
    await persistCurrentSession(sessionStore, engine);
    return true;
  } catch (error) {
    clearInterval(stageInterval);
    spinner.stop("Research failed.");

    const message =
      error instanceof ProviderError ? error.message : "An unexpected error occurred while researching your topic.";
    renderError(message);
    return false;
  }
}

/** Points at section navigation when the report is long enough to split. */
function renderSectionHint(report: string): void {
  if (splitReportSections(report).length > 1) {
    clack.log.message("Tip: type /sections to list report sections, /goto <number> to jump to one.");
  }
}
