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
  private currentTopic: string;

  constructor(
    private readonly provider: AiProvider,
    private config: SessionConfig,
  ) {
    this.currentTopic = "Untitled research session";
  }

  /** Kicks off the initial structured research report for a topic. */
  async research(topic: string): Promise<string> {
    this.currentTopic = topic;
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
        baseUrl: this.config.baseUrl,
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
        "unknown",
        error,
      );
    }
  }

  /**
   * Verifies that the given model works for this account (via a minimal
   * test request) and, if so, switches to it for subsequent requests.
   * Throws a ProviderError (propagated from testConnection) if the model
   * cannot be used, leaving the current model unchanged.
   */
  async changeModel(model: string): Promise<void> {
    await this.provider.testConnection({ apiKey: this.config.apiKey, model, baseUrl: this.config.baseUrl });
    this.config = { ...this.config, model };
  }

  /** Returns the model currently in use. */
  getModel(): string {
    return this.config.model;
  }

  /** Returns metadata about the provider currently in use. */
  getProviderInfo() {
    return this.config.provider;
  }

  /** Returns the topic of the most recent research() call. */
  getCurrentTopic(): string {
    return this.currentTopic;
  }

  /** Clears the conversation history, starting a fresh session. */
  resetConversation(): void {
    this.conversation.reset();
    this.currentTopic = "Untitled research session";
  }

  /** Returns the full conversation history, excluding the system prompt. */
  getVisibleHistory() {
    return this.conversation.getHistory().filter((message) => message.role !== "system");
  }
}