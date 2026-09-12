import * as clack from "@clack/prompts";
import { theme, wrapText } from "./theme.js";

/**
 * Renders the AI's research report as a boxed note, so the initial deep-dive
 * result is visually distinct from the ongoing chat messages that follow.
 */
export function renderResearchReport(topic: string, report: string): void {
  clack.note(wrapText(report), theme.heading(`Research report: ${topic}`));
}

/** Renders a single assistant chat reply during the interactive loop. */
export function renderAssistantReply(reply: string): void {
  console.log();
  console.log(theme.ai("AI ›"));
  console.log(wrapText(reply));
  console.log();
}

/** Renders one navigable section of a long report as a boxed note. */
export function renderReportSection(heading: string, body: string): void {
  clack.note(wrapText(body), theme.heading(heading));
}

/** Renders a friendly error message without dumping a raw stack trace. */
export function renderError(message: string): void {
  clack.log.error(theme.danger(message));
}