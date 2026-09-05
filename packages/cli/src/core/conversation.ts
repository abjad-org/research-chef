import type { ChatMessage } from "../types/index.js";
import { RESEARCH_SYSTEM_PROMPT } from "./prompts.js";

/**
 * Keeps track of the full conversation history for the current session,
 * so every request sent to the provider includes the necessary context
 * (system prompt + prior turns), enabling coherent follow-up chat.
 */
export class Conversation {
  private readonly messages: ChatMessage[] = [{ role: "system", content: RESEARCH_SYSTEM_PROMPT }];

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  /**
   * Removes the most recent message if it has the given role. Used to undo
   * an optimistically-added user message when the provider request fails,
   * so a failed turn doesn't leave an unanswered question in history.
   */
  removeLastMessageIfRole(role: ChatMessage["role"]): void {
    const last = this.messages.at(-1);
    if (last?.role === role) {
      this.messages.pop();
    }
  }

  /** Returns a defensive copy of the full message history. */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }
}
