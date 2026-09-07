import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { exportSessionToMarkdown } from "../core/exportSession.js";
import { ProviderError } from "../types/index.js";
import { theme } from "./theme.js";

export const SLASH_COMMANDS = {
  exit: "/exit",
  help: "/help",
  model: "/model",
  clear: "/clear",
  save: "/save",
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
): Promise<CommandResult> {
  const command = input.toLowerCase();

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