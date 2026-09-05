/**
 * Identifiers for every AI provider research-chef knows how to talk to.
 * Add a new value here whenever a new provider adapter is introduced.
 */
export type ProviderId = "openai" | "anthropic" | "gemini";

/**
 * Static metadata describing a provider, used to render selection menus
 * and to validate/format the user-supplied API key.
 */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  /** Roughly validates the shape of an API key for this provider. */
  keyLooksValid: (key: string) => boolean;
}

/**
 * A single message in the conversation, following the common
 * "role + content" shape used by most chat-completion APIs.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Configuration resolved once at startup (provider + credentials + model)
 * and threaded through the rest of the app.
 */
export interface SessionConfig {
  provider: ProviderInfo;
  apiKey: string;
  model: string;
}

/**
 * Contract every provider adapter must implement: given full conversation
 * history, return the assistant's next reply as plain text.
 */
export interface AiProvider {
  sendMessage(params: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
  }): Promise<string>;
}

/**
 * Error thrown by provider adapters so the UI layer can render a clean,
 * human-friendly message instead of a raw stack trace.
 */
export class ProviderError extends Error {
  public readonly providerId: ProviderId;
  public readonly sourceError?: unknown;

  constructor(message: string, providerId: ProviderId, sourceError?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.providerId = providerId;
    this.sourceError = sourceError;
  }
}
