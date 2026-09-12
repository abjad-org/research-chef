/**
 * Identifiers for every AI provider research-chef knows how to talk to.
 * Add a new value here whenever a new provider adapter is introduced.
 */
export type ProviderId = "openai" | "anthropic" | "gemini" | "custom";

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
  /**
   * Whether this provider requires the user to type in their own base
   * endpoint URL (e.g. a custom OpenAI-compatible provider). Built-in
   * providers have a fixed, hardcoded endpoint and don't need this.
   */
  requiresCustomEndpoint?: boolean;
  /**
   * Whether this provider supports native real-time web search via its own
   * API (OpenAI Responses `web_search`, Anthropic `web_search`, Gemini
   * `google_search`). The custom provider never does — it behaves as a
   * plain Chat Completions endpoint.
   */
  supportsNativeSearch?: boolean;
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
  /**
   * Base URL to send requests to, for providers that support a
   * user-supplied endpoint (currently only the "custom" provider). Ignored
   * by providers with a fixed, hardcoded endpoint.
   */
  baseUrl?: string;
}

/**
 * Contract every provider adapter must implement.
 */
export interface AiProvider {
  /** Sends the full conversation and returns the assistant's next reply. */
  sendMessage(params: {
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    baseUrl?: string;
  }): Promise<string>;

  /**
   * Sends a minimal, low-cost request to verify that the API key is valid
   * and that the given model is available for this account/plan. Used
   * during setup so key/model problems surface immediately instead of
   * after the user has already typed out a research topic.
   */
  testConnection(params: { apiKey: string; model: string; baseUrl?: string }): Promise<void>;
}

/**
 * A single verifiable web source backing a research report — always a
 * title plus a full, clickable URL (never just a bare source name).
 */
export interface WebSource {
  title: string;
  url: string;
}

/**
 * Coarse-grained classification of a provider error, used to decide how to
 * react to it (e.g. retry, block setup, or let the user proceed anyway).
 */
export type ProviderErrorKind =
  | "auth"          // invalid/expired API key (HTTP 401/403)
  | "not_found"     // model not available for this account/plan (HTTP 404)
  | "rate_limited"  // HTTP 429
  | "network"       // request never reached the server (DNS, offline, etc.)
  | "timeout"       // request was aborted after exceeding the time budget
  | "server"        // HTTP 5xx, transient on the provider's side
  | "unknown";      // anything else (unexpected shape, generic 4xx, etc.)

/**
 * Error thrown by provider adapters so the UI layer can render a clean,
 * human-friendly message instead of a raw stack trace.
 */
export class ProviderError extends Error {
  public readonly providerId: ProviderId;
  public readonly kind: ProviderErrorKind;
  public readonly sourceError?: unknown;

  constructor(
    message: string,
    providerId: ProviderId,
    kind: ProviderErrorKind = "unknown",
    sourceError?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
    this.providerId = providerId;
    this.kind = kind;
    this.sourceError = sourceError;
  }
}