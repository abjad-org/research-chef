import type { ProviderErrorKind } from "../types/index.js";

/** Maximum time to wait for a single HTTP request before aborting it. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Number of retry attempts for transient failures (network/5xx). */
const MAX_RETRIES = 2;

/** Fixed delay between retry attempts. */
const RETRY_DELAY_MS = 1_000;

/**
 * Result of a completed HTTP call: either the parsed JSON response of a
 * successful (or unsuccessful-but-reachable) request, or a classified
 * failure describing why no usable response was obtained.
 */
export type HttpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: ProviderErrorKind; status?: number; message: string; cause?: unknown };

/** Tunable timing knobs, overridable in tests to avoid real delays. */
export interface RetryOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
}

/**
 * Performs a fetch with a hard timeout and automatic retries for transient
 * failures (network errors and 5xx responses). Auth errors (401/403), not
 * found (404), and other 4xx responses are never retried, since retrying
 * them would just fail again with the exact same outcome.
 *
 * Returns a discriminated result instead of throwing, so callers can decide
 * how to react to each failure kind without try/catch boilerplate.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<HttpResult<T>> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  let lastFailure: Extract<HttpResult<T>, { ok: false }> | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await attemptFetch<T>(url, init, timeoutMs);

    if (result.ok) {
      return result;
    }

    lastFailure = result;

    const isRetryable = result.kind === "network" || result.kind === "timeout" || result.kind === "server";
    const hasAttemptsLeft = attempt < maxRetries;

    if (!isRetryable || !hasAttemptsLeft) {
      return result;
    }

    await sleep(retryDelayMs);
  }

  // Unreachable in practice (the loop always returns), but keeps TypeScript
  // satisfied that a HttpResult is always produced.
  return (
    lastFailure ?? {
      ok: false,
      kind: "unknown",
      message: "Request failed for an unknown reason.",
    }
  );
}

async function attemptFetch<T>(url: string, init: RequestInit, timeoutMs: number): Promise<HttpResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => null)) as T | null;

    if (!response.ok) {
      return {
        ok: false,
        kind: classifyHttpStatus(response.status),
        status: response.status,
        message: extractErrorMessage(data) ?? `Request failed with status ${response.status}.`,
      };
    }

    if (data === null) {
      return {
        ok: false,
        kind: "unknown",
        status: response.status,
        message: "The server returned a response that could not be parsed.",
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        kind: "timeout",
        message: `The request took longer than ${timeoutMs / 1000} seconds and was cancelled.`,
        cause: error,
      };
    }

    return {
      ok: false,
      kind: "network",
      message: "Could not reach the server. Please check your internet connection.",
      cause: error,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyHttpStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

/** Best-effort extraction of a human-readable message from a JSON error body. */
function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }

  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}