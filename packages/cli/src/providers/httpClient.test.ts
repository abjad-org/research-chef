import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchJsonWithRetry } from "../src/providers/httpClient.js";

/**
 * These tests stub out the global `fetch` so we can simulate network
 * conditions (success, auth errors, transient failures, timeouts) without
 * making any real HTTP calls. Retry delays are overridden to 0ms so the
 * suite runs fast without weakening the production defaults.
 */

const FAST_RETRY_OPTIONS = { retryDelayMs: 0 };

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchJsonWithRetry", () => {
  test("returns ok result on a successful response", async () => {
    global.fetch = (async () => jsonResponse(200, { hello: "world" })) as typeof fetch;

    const result = await fetchJsonWithRetry<{ hello: string }>("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.hello, "world");
      assert.equal(result.status, 200);
    }
  });

  test("classifies 401 as an auth error and does not retry", async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      return jsonResponse(401, { error: { message: "Invalid API key" } });
    }) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "auth");
      assert.equal(result.message, "Invalid API key");
    }
    assert.equal(callCount, 1, "auth errors should not be retried");
  });

  test("classifies 404 as not_found and does not retry", async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      return jsonResponse(404, { error: { message: "model not found" } });
    }) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "not_found");
    }
    assert.equal(callCount, 1, "not_found errors should not be retried");
  });

  test("classifies 429 as rate_limited and does not retry", async () => {
    global.fetch = (async () => jsonResponse(429, { error: { message: "slow down" } })) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "rate_limited");
    }
  });

  test("retries on 5xx errors and eventually succeeds", async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      if (callCount < 3) {
        return jsonResponse(500, { error: { message: "server error" } });
      }
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const result = await fetchJsonWithRetry<{ ok: boolean }>("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, true);
    assert.equal(callCount, 3, "should have retried twice before succeeding on the 3rd attempt");
  });

  test("gives up after exhausting retries on persistent 5xx errors", async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      return jsonResponse(503, { error: { message: "still down" } });
    }) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "server");
    }
    // 1 initial attempt + 2 retries = 3 total calls
    assert.equal(callCount, 3);
  });

  test("retries on network errors (fetch throws)", async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "network");
    }
    assert.equal(callCount, 3, "network errors should be retried up to the max");
  });

  test("classifies an AbortError as a timeout", async () => {
    global.fetch = (async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "timeout");
    }
  });

  test("treats an unparsable success body as an unknown error", async () => {
    global.fetch = (async () =>
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } })) as typeof fetch;

    const result = await fetchJsonWithRetry("https://example.com", {}, FAST_RETRY_OPTIONS);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "unknown");
    }
  });
});