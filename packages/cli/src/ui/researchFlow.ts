import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { ProviderError } from "../types/index.js";
import { renderError, renderResearchReport } from "./render.js";

const RESEARCH_STAGES = [
  "Gathering sources...",
  "Cross-checking facts...",
  "Organizing key points...",
  "Polishing the summary...",
];

/**
 * Runs the initial research request for the given topic, showing a spinner
 * with rotating status messages while the request is in flight, then
 * renders the resulting report. Returns whether the research succeeded.
 */
export async function runResearchFlow(engine: ResearchEngine, topic: string): Promise<boolean> {
  const spinner = clack.spinner();
  spinner.start(RESEARCH_STAGES[0]);

  const stageInterval = setInterval(() => {
    const stage = RESEARCH_STAGES[Math.floor(Math.random() * RESEARCH_STAGES.length)];
    spinner.message(stage);
  }, 900);

  try {
    const report = await engine.research(topic);
    clearInterval(stageInterval);
    spinner.stop("Research complete.");

    renderResearchReport(topic, report);
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
