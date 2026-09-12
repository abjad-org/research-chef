import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { SessionStore, type SessionSummary } from "../core/sessionStore.js";
import { theme } from "./theme.js";
import { exitGracefully } from "./cancel.js";

export const START_NEW_VALUE = "__new__";
const MAX_STARTUP_CHOICES = 8;

export interface StartupChoice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Builds the startup select options: "start fresh" first, then up to the 8
 * most recent sessions. Pure function — unit tested.
 */
export function buildStartupChoices(summaries: SessionSummary[]): StartupChoice[] {
  const choices: StartupChoice[] = [{ value: START_NEW_VALUE, label: "Start a new research session" }];

  for (const summary of summaries.slice(0, MAX_STARTUP_CHOICES)) {
    const count = summary.messageCount === 1 ? "1 message" : `${summary.messageCount} messages`;
    choices.push({
      value: summary.id,
      label: summary.topic,
      hint: `${formatShortDate(summary.updatedAt)} · ${count}`,
    });
  }

  return choices;
}

function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString();
}

/**
 * Offers to resume a past session instead of starting fresh. Returns true
 * when a session was resumed (caller should skip the topic prompt and go
 * straight to the chat loop). No prompt is shown when there is no history.
 */
export async function maybeResumeAtStartup(
  engine: ResearchEngine,
  store: SessionStore = new SessionStore(),
): Promise<boolean> {
  const summaries = await store.list();
  if (summaries.length === 0) return false;

  const choice = await clack.select({
    message: "Welcome back — start fresh or resume a past session?",
    options: buildStartupChoices(summaries).map((entry) => ({
      value: entry.value,
      label: entry.label,
      hint: entry.hint,
    })),
  });

  if (clack.isCancel(choice)) {
    exitGracefully();
  }

  if (choice === START_NEW_VALUE) return false;

  const session = await store.load(choice as string);
  if (!session) {
    clack.log.warn("That session could not be read. Starting fresh instead.");
    return false;
  }

  engine.restoreSession(session.topic, session.messages, session.id);
  clack.log.success(
    `Resumed "${theme.accent(session.topic)}" (${session.messages.length} messages). Ask a follow-up whenever you're ready.`,
  );
  return true;
}
