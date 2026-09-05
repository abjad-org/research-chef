import type { AiProvider, SessionConfig } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { Conversation } from "./conversation.js";
import { buildResearchKickoffMessage } from "./prompts.js";

/**
 * Orchestrates a research session: owns the conversation history and
 * delegates the actual network call to the configured provider adapter.
 * The UI layer only ever talks to this engine, never to a provider directly.
 */
export class ResearchEngine {
  private readonly conversation = new Conversation();

  constructor(
    private readonly provider: AiProvider,
    private readonly config: SessionConfig,
  ) {}

  /** Kicks off the initial structured research report for a topic. */
  async research(topic: string): Promise<string> {
    const kickoffMessage = buildResearchKickoffMessage(topic);
    return this.send(kickoffMessage);
  }

  /** Sends a follow-up chat message and returns the assistant's reply. */
  async chat(userMessage: string): Promise<string> {
    return this.send(userMessage);
  }

  private async send(userMessage: string): Promise<string> {
    this.conversation.addUserMessage(userMessage);

    try {
      const reply = await this.provider.sendMessage({
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: this.conversation.getHistory(),
      });

      this.conversation.addAssistantMessage(reply);
      return reply;
    } catch (error) {
      // Roll back the optimistic user message so a failed turn doesn't
      // leave an unanswered question in history if the user retries.
      this.conversation.removeLastMessageIfRole("user");

      if (error instanceof ProviderError) {
        throw error;
      }

      throw new ProviderError(
        "Something unexpected went wrong while talking to the AI provider.",
        this.config.provider.id,
        error,
      );
    }
  }
}
