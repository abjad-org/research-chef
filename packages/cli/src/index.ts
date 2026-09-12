#!/usr/bin/env node
import * as clack from "@clack/prompts";
import { showIntroBanner, showOutroBanner } from "./ui/banner.js";
import { runProviderSetup } from "./ui/setup.js";
import { askResearchTopic } from "./ui/topic.js";
import { runResearchFlow } from "./ui/researchFlow.js";
import { runChatLoop } from "./ui/chatLoop.js";
import { maybeResumeAtStartup } from "./ui/resumeStartup.js";
import { getProviderAdapter } from "./providers/factory.js";
import { ResearchEngine } from "./core/engine.js";
import { SessionStore } from "./core/sessionStore.js";

async function main(): Promise<void> {
  // 1. Beautiful opening
  showIntroBanner();

  // 2. Ask for provider + BYOK API key
  const sessionConfig = await runProviderSetup();
  const adapter = getProviderAdapter(sessionConfig.provider.id);
  const engine = new ResearchEngine(adapter, sessionConfig);
  const sessionStore = new SessionStore();

  // 3. Offer to resume a past session instead of starting fresh
  const resumed = await maybeResumeAtStartup(engine, sessionStore);

  if (!resumed) {
    // 4. Ask for the research topic
    const topic = await askResearchTopic();

    // 5 & 6. Loading spinner + full research result (auto-saved)
    const succeeded = await runResearchFlow(engine, topic, sessionStore);

    if (!succeeded) {
      clack.outro("Please restart research-chef and try again.");
      process.exitCode = 1;
      return;
    }
  }

  // 7. Interactive follow-up chat loop until /exit (auto-saved per turn)
  await runChatLoop(engine, sessionStore);

  showOutroBanner();
}

main().catch((error: unknown) => {
  clack.log.error("A fatal error occurred:");
  console.error(error);
  process.exit(1);
});
