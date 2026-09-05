import * as clack from "@clack/prompts";
import pc from "picocolors";
import { theme } from "./theme.js";

const LOGO = String.raw`
   ____                              _        ____ _          __
  |  _ \ ___  ___  ___  __ _ _ __ ___| |__     / ___| |__   ___ / _|
  | |_) / _ \/ __|/ _ \/ _\` | '__/ __| '_ \   | |   | '_ \ / _ \ |_
  |  _ <  __/\__ \  __/ (_| | | | (__| | | |  | |___| | | |  __/  _|
  |_| \_\___||___/\___|\__,_|_|  \___|_| |_|   \____|_| |_|\___|_|
`;

/**
 * Renders the welcome banner and a short description of what the app does.
 * Kept as its own function so the "beautiful opening" requirement stays a
 * single, easily-tweakable place in the codebase.
 */
export function showIntroBanner(): void {
  console.log(pc.magentaBright(LOGO));

  clack.intro(theme.brand(" research-chef "));

  clack.note(
    [
      theme.heading("Your personal AI research kitchen. 🍳"),
      "",
      "research-chef helps you explore any topic with the AI provider",
      "of your choice, using " + theme.accent("your own API key") + " (BYOK).",
      "",
      theme.subtle("1. Pick a provider & paste your API key"),
      theme.subtle("2. Ask your research topic"),
      theme.subtle("3. Get a clear, structured summary"),
      theme.subtle("4. Keep chatting to dig deeper — type /exit to quit"),
    ].join("\n"),
    "Welcome",
  );
}

/** Renders the closing screen when the user exits the chat loop. */
export function showOutroBanner(): void {
  clack.outro(theme.brand("Thanks for cooking up some research. See you next time! 👋"));
}
