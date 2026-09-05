import * as clack from "@clack/prompts";
import { PROVIDERS } from "../providers/registry.js";
import type { ProviderInfo, SessionConfig } from "../types/index.js";
import { theme } from "./theme.js";
import { exitGracefully } from "./cancel.js";

/**
 * Walks the user through picking an AI provider and supplying their own
 * API key (BYOK). Returns a fully-resolved SessionConfig ready to use.
 */
export async function runProviderSetup(): Promise<SessionConfig> {
  clack.log.step(theme.heading("Step 1 — Connect your AI provider"));

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

  const provider = PROVIDERS.find((entry) => entry.id === providerId) as ProviderInfo;

  const apiKey = await clack.password({
    message: `Paste your ${provider.label} API key`,
    validate: (value) => validateApiKey(value, provider),
  });

  if (clack.isCancel(apiKey)) {
    exitGracefully();
  }

  const useCustomModel = await clack.confirm({
    message: `Use the default model (${theme.accent(provider.defaultModel)})?`,
    initialValue: true,
  });

  if (clack.isCancel(useCustomModel)) {
    exitGracefully();
  }

  let model = provider.defaultModel;

  if (!useCustomModel) {
    const customModel = await clack.text({
      message: "Enter the model name to use",
      placeholder: provider.defaultModel,
      defaultValue: provider.defaultModel,
    });

    if (clack.isCancel(customModel)) {
      exitGracefully();
    }

    model = (customModel as string).trim() || provider.defaultModel;
  }

  clack.log.success(`Connected to ${theme.success(provider.label)} using ${theme.accent(model)}.`);

  return {
    provider,
    apiKey: apiKey as string,
    model,
  };
}

function validateApiKey(value: string, provider: ProviderInfo): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "An API key is required to continue.";
  }

  if (!provider.keyLooksValid(trimmed)) {
    return `That doesn't look like a valid ${provider.label} API key. Please double-check and try again.`;
  }

  return undefined;
}
