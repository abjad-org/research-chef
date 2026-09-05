import * as clack from "@clack/prompts";
import { theme } from "./theme.js";

/**
 * Standard "the user pressed Ctrl+C / Esc on a prompt" handler.
 * Call this after any `clack.isCancel(value)` check returns true.
 */
export function exitGracefully(message = "Operation cancelled. See you next time!"): never {
  clack.cancel(theme.warning(message));
  process.exit(0);
}
