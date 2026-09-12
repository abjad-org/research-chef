import * as clack from "@clack/prompts";
import { PROVIDERS } from "../providers/registry.js";
import { getProviderAdapter } from "../providers/factory.js";
import type { ProviderInfo, SessionConfig } from "../types/index.js";
import { ProviderError } from "../types/index.js";
import { theme } from "./theme.js";
import { exitGracefully } from "./cancel.js";

/**
 * Walks the user through picking an AI provider and supplying their own
 * API key (BYOK), then verifies the key/model combination actually works
 * before moving on. Returns a fully-resolved SessionConfig ready to use.
 */
export async function runProviderSetup(): Promise<SessionConfig> {
  clack.log.step(theme.heading("Step 1 — Connect your AI provider"));

  const provider = await selectProvider();
  const baseUrl = provider.requiresCustomEndpoint ? await promptEndpointUrl() : undefined;

  // Loop until we have a (key, model) combination that passes the
  // connection test, or the user decides to stop retrying.
  for (;;) {
    const apiKey = await promptApiKey(provider, baseUrl);
    const model = await promptModel(provider);

    const outcome = await verifyConnection(provider, apiKey, model, baseUrl);

    if (outcome === "ok") {
      clack.log.success(`Connected to ${theme.success(provider.label)} using ${theme.accent(model)}.`);
      // Shown exactly once here, during setup — never repeated in the chat
      // loop, reports, or exports, and worded neutrally (not as a limitation).
      if (provider.id === "custom") {
        clack.log.message(theme.subtle(getCustomProviderDisclaimer()));
      }
      return { provider, apiKey, model, baseUrl };
    }

    if (outcome === "retry_key") {
      clack.log.warn("Let's try that API key again.");
      continue;
    }

    // outcome === "retry_model": key is valid, just the model is unavailable.
    clack.log.warn("Let's pick a different model for this account.");
  }
}

async function selectProvider(): Promise<ProviderInfo> {
  const providerId = await clack.select({
    message: "Which AI provider would you like to use?",
    options: PROVIDERS.map((provider) => ({
      value: provider.id,
      label: provider.label,
    })),
  });

  if (clack.isCancel(providerId)) {
    exitGracefully();
  }

  return PROVIDERS.find((entry) => entry.id === providerId) as ProviderInfo;
}

async function promptEndpointUrl(): Promise<string> {
  const url = await clack.text({
    message: "Enter the base URL of your OpenAI-compatible endpoint",
    placeholder: "https://api.groq.com/openai/v1",
    validate: (value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return "An endpoint URL is required.";
      if (!isValidHttpUrl(trimmed)) return "Please enter a valid http(s) URL.";
      return undefined;
    },
  });

  if (clack.isCancel(url)) {
    exitGracefully();
  }

  return (url as string).trim().replace(/\/+$/, "");
}

async function promptApiKey(provider: ProviderInfo, baseUrl: string | undefined): Promise<string> {
  const keyIsOptional = provider.requiresCustomEndpoint && isOllamaEndpoint(baseUrl);

  const message = keyIsOptional
    ? `Paste your API key for this endpoint (leave blank — this looks like a local Ollama server)`
    : `Paste your ${provider.label} API key`;

  const apiKey = await clack.password({
    message,
    validate: (value) => (keyIsOptional ? undefined : validateApiKeyFormat(value, provider)),
  });

  if (clack.isCancel(apiKey)) {
    exitGracefully();
  }

  return (apiKey as string).trim();
}

async function promptModel(provider: ProviderInfo): Promise<string> {
  // The custom provider has no sensible default model to offer (it varies
  // per endpoint/deployment), so always ask for it directly.
  if (provider.requiresCustomEndpoint) {
    const model = await clack.text({
      message: "Enter the model name to use",
      placeholder: "e.g. llama-3.3-70b-versatile",
      validate: (value) => (value.trim().length === 0 ? "A model name is required." : undefined),
    });

    if (clack.isCancel(model)) {
      exitGracefully();
    }

    return (model as string).trim();
  }

  const useCustomModel = await clack.confirm({
    message: `Use the default model (${theme.accent(provider.defaultModel)})?`,
    initialValue: true,
  });

  if (clack.isCancel(useCustomModel)) {
    exitGracefully();
  }

  if (useCustomModel) {
    return provider.defaultModel;
  }

  const customModel = await clack.text({
    message: "Enter the model name to use",
    placeholder: provider.defaultModel,
    defaultValue: provider.defaultModel,
  });

  if (clack.isCancel(customModel)) {
    exitGracefully();
  }

  return (customModel as string).trim() || provider.defaultModel;
}

/**
 * Neutral, one-time note shown during custom-endpoint setup. It states how
 * answers are produced without framing anything as a limitation.
 */
export const CUSTOM_TRAINING_DATA_DISCLAIMER =
  "Note: responses from this endpoint are based on the model's training data, not real-time web search.";

/** Returns the one-time disclaimer shown for custom (OpenAI-compatible) endpoints. */
export function getCustomProviderDisclaimer(): string {
  return CUSTOM_TRAINING_DATA_DISCLAIMER;
}

type VerifyOutcome = "ok" | "retry_key" | "retry_model";

/** Minimal spinner interface so the outcome-decision logic can be unit tested without a real terminal spinner. */
interface SpinnerLike {
  stop: (message?: string) => void;
}

/**
 * Sends a minimal test request to confirm the API key and model actually
 * work together, so problems surface here instead of after the user has
 * already typed out a research topic.
 */
async function verifyConnection(
  provider: ProviderInfo,
  apiKey: string,
  model: string,
  baseUrl: string | undefined,
): Promise<VerifyOutcome> {
  const spinner = clack.spinner();
  spinner.start(`Verifying your ${provider.label} connection...`);

  try {
    const adapter = getProviderAdapter(provider.id);
    await adapter.testConnection({ apiKey, model, baseUrl });
    spinner.stop("Connection verified.");
    return "ok";
  } catch (error) {
    return handleVerificationError(spinner, provider, model, error);
  }
}

export function handleVerificationError(
  spinner: SpinnerLike,
  provider: ProviderInfo,
  model: string,
  error: unknown,
): VerifyOutcome {
  if (!(error instanceof ProviderError)) {
    spinner.stop("Verification failed.");
    clack.log.error("An unexpected error occurred while verifying your connection.");
    return "retry_key";
  }

  switch (error.kind) {
    case "auth":
      spinner.stop("That API key was rejected.");
      clack.log.error(
        `${provider.label} rejected this key. Please double-check that you copied it correctly and that it hasn't expired or been revoked.`,
      );
      return "retry_key";

    case "not_found":
      spinner.stop("Model unavailable.");
      clack.log.warn(
        [
          `Your API key works, but the model "${theme.accent(model)}" isn't available on your ${provider.label} account or plan.`,
          "Please choose a different model.",
        ].join("\n"),
      );
      return "retry_model";

    default:
      // Network hiccups, rate limits, or a temporary outage aren't the
      // user's fault — warn them but let them proceed, since the real
      // research request might still succeed.
      spinner.stop("Could not fully verify the connection.");
      clack.log.warn(
        [
          `We couldn't verify your ${provider.label} connection just now (${error.message}).`,
          "This might be a temporary issue on the provider's side. Continuing anyway —",
          "you'll see a clear error later if the key truly doesn't work.",
        ].join("\n"),
      );
      return "ok";
  }
}

export function validateApiKeyFormat(value: string, provider: ProviderInfo): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "An API key is required to continue.";
  }

  if (!provider.keyLooksValid(trimmed)) {
    return `That doesn't look like a valid ${provider.label} API key. Please double-check and try again.`;
  }

  return undefined;
}

/**
 * Detects whether a base URL points at a local Ollama server, which
 * typically runs without any authentication. Used to make the API key
 * optional for the custom provider in that specific case.
 */
export function isOllamaEndpoint(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;

  try {
    const { hostname } = new URL(baseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}