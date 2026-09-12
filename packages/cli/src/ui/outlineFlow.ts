import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import {
  formatOutlineForDisplay,
  parseEditedOutline,
  type ReportOutline,
} from "../core/outline.js";
import { ProviderError } from "../types/index.js";
import { theme } from "./theme.js";
import { exitGracefully } from "./cancel.js";

/**
 * The subset of `@clack/prompts` used by the outline flow, extracted so
 * tests can inject fakes instead of driving an interactive TTY.
 */
export interface OutlinePrompts {
  select: typeof clack.select;
  text: typeof clack.text;
  isCancel: typeof clack.isCancel;
}

const defaultOutlinePrompts: OutlinePrompts = {
  select: clack.select,
  text: clack.text,
  isCancel: clack.isCancel,
};

export type OutlineChoice = "approve" | "edit" | "regenerate";

export interface OutlineFlowResult {
  status: "approved" | "skipped";
  outline?: ReportOutline;
}

/**
 * Drafts an outline for the topic and lets the user approve, edit, or
 * regenerate it before the full (more expensive) report is generated.
 * Returns `skipped` when outline drafting fails — callers should fall back
 * to a direct report rather than blocking the user.
 */
export async function runOutlineFlow(
  engine: ResearchEngine,
  topic: string,
  prompts: OutlinePrompts = defaultOutlinePrompts,
): Promise<OutlineFlowResult> {
  let outline: ReportOutline;
  try {
    outline = await draftWithSpinner(engine, topic);
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Could not draft an outline.";
    clack.log.warn(`${message} Continuing with a direct report instead.`);
    return { status: "skipped" };
  }

  for (;;) {
    clack.note(formatOutlineForDisplay(outline), theme.heading(`Proposed outline: ${topic}`));

    const choice = await prompts.select({
      message: "How does this outline look?",
      options: [
        { value: "approve", label: "Approve — generate the full report" },
        { value: "edit", label: "Edit — revise the sections", hint: "type your own headings" },
        { value: "regenerate", label: "Regenerate — draft a fresh outline" },
      ],
    });

    if (prompts.isCancel(choice)) {
      exitGracefully();
    }

    if (choice === "approve") {
      return { status: "approved", outline };
    }

    if (choice === "regenerate") {
      try {
        outline = await draftWithSpinner(engine, topic);
      } catch (error) {
        const message = error instanceof ProviderError ? error.message : "Could not draft an outline.";
        clack.log.warn(`${message} Keeping the previous outline.`);
      }
      continue;
    }

    // choice === "edit": single-line friendly — sections separated by `;`.
    const edited = await prompts.text({
      message: "Type your revised outline (separate sections with ;)",
      placeholder: "Background; Key developments; Open questions",
    });

    if (prompts.isCancel(edited)) {
      exitGracefully();
    }

    const parsed = parseEditedOutline(topic, (edited as string).trim());
    if (!parsed) {
      clack.log.warn("That edit had no usable sections — keeping the previous outline.");
      continue;
    }

    outline = parsed;
  }
}

async function draftWithSpinner(engine: ResearchEngine, topic: string): Promise<ReportOutline> {
  const spinner = clack.spinner();
  spinner.start("Drafting an outline...");

  try {
    const outline = await engine.generateOutline(topic);
    spinner.stop("Outline drafted.");
    return outline;
  } catch (error) {
    spinner.stop("Could not draft an outline.");
    throw error;
  }
}
