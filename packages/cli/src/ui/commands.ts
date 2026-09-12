import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { exportSessionToMarkdown } from "../core/exportSession.js";
import { SessionStore, type SessionSummary } from "../core/sessionStore.js";
import { formatSectionList, resolveSectionTarget, splitReportSections } from "../core/outline.js";
import { ProviderError } from "../types/index.js";
import { theme } from "./theme.js";
import { renderReportSection } from "./render.js";

export const SLASH_COMMANDS = {
  exit: "/exit",
  help: "/help",
  model: "/model",
  clear: "/clear",
  save: "/save",
  history: "/history",
  resume: "/resume",
  sections: "/sections",
  goto: "/goto",
} as const;

/** Result of attempting to handle a line of user input as a command. */
export type CommandResult =
  | { handled: false } // not a recognized command; treat as a chat message
  | { handled: true; shouldExit: boolean };

/**
 * The subset of `@clack/prompts` used by command handlers, extracted into
 * an interface so tests can inject lightweight fakes instead of mocking a
 * live ES module namespace (which Node's `mock.method` cannot redefine).
 */
export interface PromptAdapter {
  text: typeof clack.text;
  confirm: typeof clack.confirm;
  isCancel: typeof clack.isCancel;
}

const defaultPrompts: PromptAdapter = {
  text: clack.text,
  confirm: clack.confirm,
  isCancel: clack.isCancel,
};

/**
 * Attempts to interpret the given input as a slash command. Returns
 * `{ handled: false }` if the input isn't a recognized command, so the
 * caller knows to treat it as a normal chat message instead.
 *
 * `prompts` defaults to the real `@clack/prompts` functions and can be
 * overridden in tests with fakes that don't require an interactive TTY.
 */
export async function handleCommand(
  input: string,
  engine: ResearchEngine,
  prompts: PromptAdapter = defaultPrompts,
  sessionStore: SessionStore = new SessionStore(),
): Promise<CommandResult> {
  const normalized = input.trim().toLowerCase();
  const [command, ...rest] = normalized.split(/\s+/);

  switch (command) {
    case SLASH_COMMANDS.exit:
      return { handled: true, shouldExit: true };

    case SLASH_COMMANDS.help:
      showHelp();
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.model:
      await handleModelCommand(engine, prompts);
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.clear:
      await handleClearCommand(engine, prompts);
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.save:
      await handleSaveCommand(engine);
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.history:
      await handleHistoryCommand(sessionStore, rest.join(" ").trim());
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.resume:
      await handleResumeCommand(engine, prompts, sessionStore, rest.join(" ").trim());
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.sections:
      handleSectionsCommand(engine);
      return { handled: true, shouldExit: false };

    case SLASH_COMMANDS.goto:
      handleGotoCommand(engine, rest.join(" ").trim());
      return { handled: true, shouldExit: false };

    default:
      return { handled: false };
  }
}

function showHelp(): void {
  clack.log.message(
    [
      `${theme.command(SLASH_COMMANDS.model)}  — switch to a different AI model`,
      `${theme.command(SLASH_COMMANDS.clear)}  — clear the conversation and start a new topic`,
      `${theme.command(SLASH_COMMANDS.save)}   — export this conversation to a Markdown file`,
      `${theme.command(SLASH_COMMANDS.history)} [filter] — list past sessions, optionally filtered by topic`,
      `${theme.command(SLASH_COMMANDS.resume)} <number> — resume a past session from /history`,
      `${theme.command(SLASH_COMMANDS.sections)} — list the sections of the current report`,
      `${theme.command(SLASH_COMMANDS.goto)} <number> — jump to one section of the current report`,
      `${theme.command(SLASH_COMMANDS.exit)}   — quit research-chef`,
    ].join("\n"),
  );
}

async function handleModelCommand(engine: ResearchEngine, prompts: PromptAdapter): Promise<void> {
  const provider = engine.getProviderInfo();

  const newModel = await prompts.text({
    message: `Enter a model name for ${provider.label}`,
    placeholder: engine.getModel(),
    defaultValue: engine.getModel(),
  });

  if (prompts.isCancel(newModel)) {
    clack.log.message("Kept the current model.");
    return;
  }

  const trimmed = (newModel as string).trim();

  if (trimmed.length === 0 || trimmed === engine.getModel()) {
    clack.log.message("Kept the current model.");
    return;
  }

  const spinner = clack.spinner();
  spinner.start(`Checking access to "${trimmed}"...`);

  try {
    await engine.changeModel(trimmed);
    spinner.stop(`Switched to ${theme.accent(trimmed)}.`);
  } catch (error) {
    spinner.stop("Could not switch models.");
    clack.log.error(describeModelError(error, trimmed, provider.label));
  }
}

export function describeModelError(error: unknown, model: string, providerLabel: string): string {
  if (error instanceof ProviderError && error.kind === "not_found") {
    return `"${model}" isn't available on your ${providerLabel} account or plan. Staying on the previous model.`;
  }
  if (error instanceof ProviderError) {
    return `Could not verify "${model}" (${error.message}). Staying on the previous model.`;
  }
  return `An unexpected error occurred while switching models. Staying on the previous model.`;
}

async function handleClearCommand(engine: ResearchEngine, prompts: PromptAdapter): Promise<void> {
  const confirmed = await prompts.confirm({
    message: "Clear the current conversation and start a new topic?",
    initialValue: false,
  });

  if (prompts.isCancel(confirmed) || !confirmed) {
    clack.log.message("Kept the current conversation.");
    return;
  }

  engine.resetConversation();
  clack.log.success("Conversation cleared. Ask a new question whenever you're ready.");
}

async function handleSaveCommand(engine: ResearchEngine): Promise<void> {
  const history = engine.getVisibleHistory();

  if (history.length === 0) {
    clack.log.warn("There's nothing to save yet.");
    return;
  }

  const spinner = clack.spinner();
  spinner.start("Saving conversation...");

  try {
    const filePath = await exportSessionToMarkdown(engine.getCurrentTopic(), history);
    spinner.stop("Conversation saved.");
    clack.log.success(`Saved to ${theme.accent(filePath)}`);
  } catch (error) {
    spinner.stop("Could not save the conversation.");
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    clack.log.error(`Failed to save: ${message}`);
  }
}

/** Lists past auto-saved sessions, newest first, optionally filtered by topic. */
async function handleHistoryCommand(store: SessionStore, filter: string): Promise<void> {
  const summaries = filter ? await store.search(filter) : await store.list();

  if (summaries.length === 0) {
    clack.log.warn(
      filter ? `No past sessions match "${filter}".` : "No past sessions yet. They are saved automatically as you chat.",
    );
    return;
  }

  clack.log.message(formatSessionList(summaries, filter));
}

/**
 * Resumes a past session by its 1-based number from `/history` (or by raw
 * session id). Replaces the current conversation after confirmation when
 * there is unsaved work in progress.
 */
async function handleResumeCommand(
  engine: ResearchEngine,
  prompts: PromptAdapter,
  store: SessionStore,
  arg: string,
): Promise<void> {
  const summaries = await store.list();

  if (summaries.length === 0) {
    clack.log.warn("No past sessions to resume yet.");
    return;
  }

  const target = resolveResumeTarget(summaries, arg);
  if (!target) {
    clack.log.warn(
      arg
        ? `Couldn't find session "${arg}". Run ${theme.command("/history")} to see available numbers.`
        : `Please specify which session to resume, e.g. ${theme.command("/resume 1")}.`,
    );
    return;
  }

  const session = await store.load(target.id);
  if (!session) {
    clack.log.error("That session file could not be read. It may have been moved or corrupted.");
    return;
  }

  if (engine.getVisibleHistory().length > 0) {
    const confirmed = await prompts.confirm({
      message: `Replace the current conversation with "${session.topic}"?`,
      initialValue: false,
    });

    if (prompts.isCancel(confirmed) || !confirmed) {
      clack.log.message("Kept the current conversation.");
      return;
    }
  }

  engine.restoreSession(session.topic, session.messages, session.id);
  clack.log.success(
    `Resumed "${theme.accent(session.topic)}" (${session.messages.length} messages). Ask a follow-up whenever you're ready.`,
  );
}

/**
 * Renders a numbered session list (newest first) for the terminal, plus a
 * hint showing how to resume. Pure function — unit tested.
 */
export function formatSessionList(summaries: SessionSummary[], filter?: string): string {
  const lines = summaries.map((summary, index) => {
    const when = formatSessionDate(summary.updatedAt);
    const count = summary.messageCount === 1 ? "1 message" : `${summary.messageCount} messages`;
    return `${index + 1}. ${summary.topic} — ${when}, ${count}`;
  });

  lines.push(`Type ${SLASH_COMMANDS.resume} <number> to resume a session.`);
  if (filter) {
    return [`Past sessions matching "${filter}":`, ...lines].join("\n");
  }
  return ["Past sessions (newest first):", ...lines].join("\n");
}

/** Best-effort short date for list display; falls back to the raw value. */
export function formatSessionDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

/**
 * Resolves a `/resume` argument to a session summary: a 1-based list
 * number first, then a raw session id. Returns undefined when the argument
 * is missing or matches nothing. Pure function — unit tested.
 */
export function resolveResumeTarget(
  summaries: SessionSummary[],
  arg: string,
): SessionSummary | undefined {
  const trimmed = arg.trim();
  if (!trimmed) return undefined;

  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= summaries.length) {
    return summaries[asNumber - 1];
  }

  return summaries.find((summary) => summary.id === trimmed);
}

/** Lists the navigable sections of the most recent report. */
function handleSectionsCommand(engine: ResearchEngine): void {
  const report = engine.getLastReport();

  if (!report) {
    clack.log.warn("No report yet. Research a topic first, then list its sections.");
    return;
  }

  clack.log.message(formatSectionList(splitReportSections(report)));
}

/** Prints one section of the most recent report, by number or heading. */
function handleGotoCommand(engine: ResearchEngine, arg: string): void {
  const report = engine.getLastReport();

  if (!report) {
    clack.log.warn("No report yet. Research a topic first, then jump to a section.");
    return;
  }

  const sections = splitReportSections(report);
  const target = resolveSectionTarget(sections, arg);

  if (!target) {
    clack.log.warn(
      arg
        ? `Couldn't find section "${arg}". Run ${theme.command("/sections")} to see available numbers.`
        : `Please specify which section to read, e.g. ${theme.command("/goto 1")}.`,
    );
    return;
  }

  renderReportSection(target.heading, target.body);
}