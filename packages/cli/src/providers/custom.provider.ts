import type { AiProvider } from "../types/index.js";
import { createOpenAiCompatibleProvider } from "./openai.provider.js";

/**
 * Adapter for user-supplied, OpenAI-compatible endpoints (Groq, Together
 * AI, OpenRouter, Ollama, LM Studio, a self-hosted vLLM server, etc).
 *
 * There's no fixed default base URL here — the user always provides their
 * own via SessionConfig.baseUrl, which is threaded through by the engine
 * on every request. This adapter shares all of its request logic with the
 * built-in OpenAI provider, since both speak the same API shape.
 */
export const customProvider: AiProvider = createOpenAiCompatibleProvider("custom", "");