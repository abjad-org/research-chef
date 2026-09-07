import * as clack from "@clack/prompts";
import type { ResearchEngine } from "../core/engine.js";
import { ProviderError } from "../types/index.js";
import { theme } from "./theme.js";
import { renderAssistantReply, renderError } from "./render.js";
import { exitGracefully } from "./cancel.js";
import { SLASH_COMMANDS, handleCommand } from "./commands.js";

/**
 * Runs the interactive follow-up chat loop: repeatedly prompts the user for
 * a message, sends it through the engine, and prints the reply — until the
 * user types /exit (or cancels the prompt).
 */
export async function runChatLoop(engine: ResearchEngine): Promise<void> {
  clack.log.step(theme.heading("Step 4 — Keep exploring"));
  clack.log.message(
    [
      `Ask a follow-up question, or type ${theme.command(SLASH_COMMANDS.exit)} to quit.`,
      `Type ${theme.command(SLASH_COMMANDS.help)} to see all available commands.`,
    ].join("\n"),
  );

  for (;;) {
    const input = await clack.text({
      message: theme.user("You ›"),
      placeholder: "Ask a follow-up question…",
    });

    if (clack.isCancel(input)) {
      exitGracefully();
    }

    const message = (input as string).trim();

    if (message.length === 0) {
      continue;
    }

    const commandResult = await handleCommand(message, engine);

    if (commandResult.handled) {
      if (commandResult.shouldExit) {
        break;
      }
      continue;
    }

    await handleUserMessage(engine, message);
  }
}

async function handleUserMessage(engine: ResearchEngine, message: string): Promise<void> {
  const spinner = clack.spinner();
  spinner.start("Thinking...");

  try {
    const reply = await engine.chat(message);
    spinner.stop("Got a reply.");
    renderAssistantReply(reply);
  } catch (error) {
    spinner.stop("Something went wrong.");
    renderError(describeError(error));
  }
}

function describeError(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.message;
  }
  return "An unexpected error occurred. Please try again.";
}