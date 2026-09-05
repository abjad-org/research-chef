import * as clack from "@clack/prompts";
import { theme } from "./theme.js";
import { exitGracefully } from "./cancel.js";

/** Prompts the user for the research topic they want the AI to investigate. */
export async function askResearchTopic(): Promise<string> {
  clack.log.step(theme.heading("Step 2 — What should we research?"));

  const topic = await clack.text({
    message: "Enter a research topic",
    placeholder: "e.g. The impact of AI on renewable energy adoption",
    validate: (value) => {
      if (value.trim().length === 0) return "Please enter a topic to research.";
      if (value.trim().length < 3) return "Please provide a bit more detail.";
      return undefined;
    },
  });

  if (clack.isCancel(topic)) {
    exitGracefully();
  }

  return (topic as string).trim();
}
