import type { AiProvider, ChatMessage, SessionConfig } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { Conversation } from "./conversation.js";
import { buildResearchKickoffMessage } from "./prompts.js";
import {
  buildOutlinePrompt,
  buildReportFromOutlinePrompt,
  parseOutlineText,
  type ReportOutline,
} from "./outline.js";
import { RESEARCH_SYSTEM_PROMPT } from "./prompts.js";

/**
 * Orchestrates a research session: owns the conversation history and
 * delegates the actual network call to the configured provider adapter.
 * The UI layer only ever talks to this engine, never to a provider directly.
 */
export class ResearchEngine {
  private readonly conversation = new Conversation();
  private currentTopic: string;
  private sessionId: string | undefined;
  private lastReport: string | undefined;

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
    const report = await this.send(kickoffMessage);
    this.lastReport = report;
    return report;
  }

  /**
   * Drafts an outline (sections + sub-questions) for a topic without
   * touching the main conversation history, so regenerating is cheap and
   * leaves no meta-turns behind.
   */
  async generateOutline(topic: string): Promise<ReportOutline> {
    try {
      const raw = await this.provider.sendMessage({
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: [
          { role: "system", content: RESEARCH_SYSTEM_PROMPT },
          { role: "user", content: buildOutlinePrompt(topic) },
        ],
        baseUrl: this.config.baseUrl,
      });

      const outline = parseOutlineText(topic, raw);
      if (outline.sections.length === 0) {
        throw new ProviderError(
          "The provider returned an outline without any sections.",
          this.config.provider.id,
          "unknown",
        );
      }
      return outline;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "Something unexpected went wrong while drafting the outline.",
        this.config.provider.id,
        "unknown",
        error,
      );
    }
  }

  /** Generates the full report following a user-approved outline. */
  async researchWithOutline(topic: string, outline: ReportOutline): Promise<string> {
    this.currentTopic = topic;
    const kickoffMessage = buildReportFromOutlinePrompt(topic, outline);
    const report = await this.send(kickoffMessage);
    this.lastReport = report;
    return report;
  }

  /** Returns the most recent full research report, if any. */
  getLastReport(): string | undefined {
    return this.lastReport;
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
    this.sessionId = undefined;
    this.lastReport = undefined;
  }

  /**
   * Restores a previously saved session (topic + visible messages) into
   * this engine, e.g. after `/resume`. Only `user`/`assistant` turns are
   * restored — the system prompt is always the current one.
   */
  restoreSession(topic: string, messages: ChatMessage[], sessionId?: string): void {
    this.conversation.reset();
    for (const message of messages) {
      if (message.role === "user") this.conversation.addUserMessage(message.content);
      else if (message.role === "assistant") this.conversation.addAssistantMessage(message.content);
    }
    this.currentTopic = topic;
    this.sessionId = sessionId;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    this.lastReport = lastAssistant?.content;
  }

  /** Stable id used to update the same auto-save file across turns. */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Sets the auto-save file id (used after the first save of a session). */
  setSessionId(id: string): void {
    this.sessionId = id;
  }

  /** Returns the full conversation history, excluding the system prompt. */
  getVisibleHistory() {
    return this.conversation.getHistory().filter((message) => message.role !== "system");
  }
}