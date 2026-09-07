import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateApiKeyFormat,
  handleVerificationError,
  isOllamaEndpoint,
  isValidHttpUrl,
} from "../src/ui/setup.js";
import { ProviderError } from "../src/types/index.js";
import type { ProviderInfo } from "../src/types/index.js";

function makeProviderInfo(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "openai",
    label: "OpenAI",
    hint: "test hint",
    defaultModel: "gpt-test",
    keyLooksValid: (key) => key.startsWith("sk-") && key.length >= 20,
    ...overrides,
  };
}

/** A no-op spinner stand-in; only its presence/call-ability matters here. */
const fakeSpinner = { stop: () => {} };

describe("validateApiKeyFormat", () => {
  test("rejects an empty string", () => {
    const provider = makeProviderInfo();
    const result = validateApiKeyFormat("", provider);

    assert.match(result ?? "", /required/);
  });

  test("rejects a string that doesn't match the provider's key shape", () => {
    const provider = makeProviderInfo();
    const result = validateApiKeyFormat("not-a-valid-key", provider);

    assert.match(result ?? "", /doesn't look like a valid OpenAI API key/);
  });

  test("accepts a key that matches the provider's expected shape", () => {
    const provider = makeProviderInfo();
    const result = validateApiKeyFormat("sk-1234567890abcdef1234", provider);

    assert.equal(result, undefined);
  });

  test("trims whitespace before validating", () => {
    const provider = makeProviderInfo();
    const result = validateApiKeyFormat("   ", provider);

    assert.match(result ?? "", /required/);
  });
});

describe("handleVerificationError", () => {
  test("returns retry_key for an auth error", () => {
    const provider = makeProviderInfo();
    const error = new ProviderError("Invalid API key", "openai", "auth");

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-test", error);

    assert.equal(outcome, "retry_key");
  });

  test("returns retry_model for a not_found error", () => {
    const provider = makeProviderInfo();
    const error = new ProviderError("model missing", "openai", "not_found");

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-exotic", error);

    assert.equal(outcome, "retry_model");
  });

  test("returns ok (lets the user proceed) for a network error", () => {
    const provider = makeProviderInfo();
    const error = new ProviderError("Could not reach the server.", "openai", "network");

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-test", error);

    assert.equal(outcome, "ok");
  });

  test("returns ok for a server (5xx) error", () => {
    const provider = makeProviderInfo();
    const error = new ProviderError("Internal server error", "openai", "server");

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-test", error);

    assert.equal(outcome, "ok");
  });

  test("returns ok for a timeout error", () => {
    const provider = makeProviderInfo();
    const error = new ProviderError("timed out", "openai", "timeout");

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-test", error);

    assert.equal(outcome, "ok");
  });

  test("returns retry_key for a non-ProviderError value", () => {
    const provider = makeProviderInfo();

    const outcome = handleVerificationError(fakeSpinner, provider, "gpt-test", new Error("boom"));

    assert.equal(outcome, "retry_key");
  });
});

describe("isOllamaEndpoint", () => {
  test("returns true for localhost", () => {
    assert.equal(isOllamaEndpoint("http://localhost:11434"), true);
  });

  test("returns true for 127.0.0.1", () => {
    assert.equal(isOllamaEndpoint("http://127.0.0.1:11434/v1"), true);
  });

  test("returns true for the IPv6 loopback address", () => {
    assert.equal(isOllamaEndpoint("http://[::1]:11434"), true);
  });

  test("returns false for a remote hosted endpoint", () => {
    assert.equal(isOllamaEndpoint("https://api.groq.com/openai/v1"), false);
  });

  test("returns false for undefined", () => {
    assert.equal(isOllamaEndpoint(undefined), false);
  });

  test("returns false for a malformed URL instead of throwing", () => {
    assert.equal(isOllamaEndpoint("not a url"), false);
  });
});

describe("isValidHttpUrl", () => {
  test("accepts a valid https URL", () => {
    assert.equal(isValidHttpUrl("https://api.groq.com/openai/v1"), true);
  });

  test("accepts a valid http URL (e.g. local server)", () => {
    assert.equal(isValidHttpUrl("http://localhost:11434"), true);
  });

  test("rejects a non-http(s) protocol", () => {
    assert.equal(isValidHttpUrl("ftp://example.com"), false);
  });

  test("rejects a malformed string instead of throwing", () => {
    assert.equal(isValidHttpUrl("not a url"), false);
  });

  test("rejects an empty string", () => {
    assert.equal(isValidHttpUrl(""), false);
  });
});