# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet — this section will track changes as they land on `main` ahead
of the next release.

## [0.3.0] - 2026-09-12

### Added

- **Native web search + verifiable citations (Priority 1)** — built-in
  providers now search the live web on every research request and append a
  clickable `Sources:` section (title + full URL per entry) to each report:
  - OpenAI now uses the Responses API (`POST /v1/responses`) with the
    native `web_search` tool; citations are parsed from `url_citation`
    annotations (plus the aggregated `output_text` fallback).
  - Anthropic Messages API requests include the `web_search_20250305`
    server tool (`max_uses: 5`); citations are parsed from
    `web_search_result_location` blocks, with `pause_turn` continuations
    (up to 3) handled inside the adapter.
  - Gemini `generateContent` requests include the `google_search` grounding
    tool; sources are parsed from `groundingMetadata.groundingChunks`.
  - Shared helpers in `src/core/citations.ts` (`deduplicateSources`,
    `formatSourcesSection`, `appendSourcesSection`) keep source handling
    provider-agnostic; the system prompt now asks for inline URLs plus a
    final `Sources:` list.
  - The Custom (OpenAI-compatible) provider is unchanged — plain Chat
    Completions with no search tool. Its setup flow shows a one-time,
    neutral note ("responses from this endpoint are based on the model's
    training data, not real-time web search"), shown once during setup
    only and never repeated or framed as a limitation.
  - New automated coverage: `test/citations.test.ts` (10 tests) and
    `test/websearch.test.ts` (13 tests); the built-in OpenAI cases in
    `test/openai.compatible.test.ts` were updated for the Responses
    endpoint. Suite total: 99 tests, all passing.

- **Session management (Priority 2)** — conversations are now auto-saved
  and resumable, so work is never lost when the user forgets `/save`:
  - Every successful research report and follow-up reply is auto-saved as
    JSON under `~/.research-chef/sessions/` (same stable file updated
    across turns; API keys are never written to disk — only provider id,
    model, topic, and messages).
  - New `/history [filter]` command lists past sessions newest-first with
    topic, date, and message count; an optional filter narrows by topic
    substring (case-insensitive).
  - New `/resume <number|id>` command restores a past session into the
    current engine (confirming first when unsaved work is in progress).
  - At startup, when past sessions exist, a picker offers to resume one
    instead of starting fresh — otherwise the normal topic flow runs.
  - New coverage in `test/sessions.test.ts` (26 tests: store round-trip,
    auto-save, restore, list/filter/resume helpers, startup choices, and
    command handlers). Suite total: 125 tests, all passing.

- **Structure & organization (Priority 3)** — reports are now planned
  before they're written, and long reports are navigable:
  - Before the full report, the engine drafts an outline (3-6 sections,
    each with guiding sub-questions) that the user can **Approve**,
    **Edit** (free-text headings separated by `;`), or **Regenerate**.
    Outline drafting never pollutes the main conversation history, and a
    drafting failure falls back to a direct report instead of blocking.
  - The approved outline is embedded in the report request so each heading
    becomes a section header; broad topics are broken into sub-questions
    up front via the outline prompt.
  - New `/sections` command lists the sections of the latest report and
    new `/goto <number|heading>` jumps to one section (by number or
    case-insensitive heading match). Splitting prefers Markdown headings,
    falls back to short numbered headings, and excludes the trailing
    `Sources:` block from navigation.
  - New coverage in `test/outline.test.ts` (31 tests: prompt builders,
    outline parsing/editing/display, section splitting, engine outline +
    last-report tracking, the approve/edit/regenerate flow, and the new
    commands). Suite total: 156 tests, all passing.

## [0.2.1] - 2026-09-07
### Fixed
- Excluded test files (`**/*.test.ts` and the `test/` directory) from `tsconfig.json`, so a test file accidentally placed inside `src/` no longer breaks `npm run typecheck` and `npm run build`.
- Replaced the shell-glob-based `npm test` script (`tsx --test test/**/*.test.ts`) with a small cross-platform runner (`scripts/run-tests.mjs`) that discovers test files using Node's own filesystem APIs instead of relying on shell glob expansion. The previous script worked in shells that support globstar (e.g. bash on most developer machines) but failed in the POSIX `sh` used by GitHub Actions runners, causing CI to fail even though local runs succeeded.

## [0.2.0] - 2026-09-07

### Added

- **API key verification at setup** — after entering an API key and model,
  research-chef now sends a minimal test request to confirm they actually
  work together before moving on to the research topic. Invalid keys and
  unavailable models are now caught immediately, with clear guidance:
  - An invalid/expired key prompts the user to re-enter it
  - A key that's valid but paired with a model unavailable on that
    account/plan prompts the user to pick a different model
  - Network hiccups or temporary provider outages no longer block setup —
    the user can proceed and will see a clear error later if needed
- **`/model` command** — switch to a different AI model mid-conversation
  without restarting the CLI. The new model is verified the same way as
  during setup before being applied.
- **`/clear` command** — reset the current conversation and start a new
  topic in the same session, after a confirmation prompt.
- **`/save` command** — export the current conversation to a Markdown file
  under `~/.research-chef/exports/`, named after the topic and timestamp.
- **Custom (OpenAI-compatible) provider** — connect research-chef to any
  endpoint that speaks the OpenAI Chat Completions API shape, such as
  [Groq](https://groq.com), [Together AI](https://together.ai),
  [OpenRouter](https://openrouter.ai), a local [Ollama](https://ollama.com)
  server, LM Studio, or a self-hosted deployment:
  - At setup, choosing "Custom (OpenAI-compatible)" prompts for the
    endpoint's base URL (e.g. `https://api.groq.com/openai/v1`) in addition
    to the usual API key and model.
  - The API key is optional when the base URL points at a local Ollama
    server (`localhost` / `127.0.0.1` / `[::1]`), since those typically run
    without authentication.
  - The same key/model verification step used for built-in providers
    applies here too, so misconfigured endpoints or unavailable models are
    caught immediately.
- Automated test suite using Node's built-in test runner (`node:test`),
  covering the HTTP retry/timeout logic, the research/chat engine, the
  session export module, slash command handling, the setup verification
  flow, and the OpenAI-compatible provider factory (76 tests total). Run
  with `npm test`.
- CI now runs the test suite in addition to type-checking and building.

### Changed

- All provider adapters (OpenAI, Anthropic, Gemini) now share a common HTTP
  client (`src/providers/httpClient.ts`) with:
  - A 30-second timeout per request, so a slow or unresponsive provider no
    longer hangs the CLI indefinitely
  - Automatic retries (up to 2, with a 1-second delay) for transient
    failures — network errors and 5xx responses. Authentication errors,
    not-found errors, and rate limiting are never retried, since retrying
    them would just fail again the same way.
- `ProviderError` now carries a `kind` field (`auth`, `not_found`,
  `rate_limited`, `network`, `timeout`, `server`, or `unknown`) so callers
  can react appropriately to each failure type instead of only having a
  generic message.
- Refactored the OpenAI adapter into a reusable
  `createOpenAiCompatibleProvider(providerId, defaultBaseUrl)` factory, so
  future OpenAI-compatible providers (built-in or custom) can share the
  same request logic instead of duplicating it. The built-in OpenAI
  provider and the new custom provider are now both built from this
  factory.
- `AiProvider.sendMessage()` and `AiProvider.testConnection()` now accept
  an optional `baseUrl`, and `SessionConfig` carries it through the engine
  to the active adapter.
- Raised the minimum supported Node.js version from 18.17.0 to **18.19.0**,
  required for the test runner tooling used in this release.

## [0.1.2] - 2026-09-05

### Fixed

- Normalized `packages/cli/package.json` fields flagged by npm during
  publish (`bin` path and `repository.url`) using `npm pkg fix`, so
  publishing no longer emits auto-correction warnings

## [0.1.1] - 2026-09-05

### Added

- GitHub Actions workflow to automatically publish `@abjad-org/research-chef`
  to npm when a `v*.*.*` tag is pushed

### Changed

- Renamed the CLI package from `@research-chef/cli` to
  `@abjad-org/research-chef` so it can be published to npm under the
  `abjad-org` scope

## [0.1.0] - 2026-09-05

### Added

- Initial release of `research-chef` 🎉
- Interactive CLI flow built with `@clack/prompts` and `picocolors`:
  - Welcome banner introducing the tool
  - BYOK provider setup: choose OpenAI, Anthropic (Claude), or Google
    Gemini, and securely enter your own API key (masked input, with basic
    format validation)
  - Optional custom model selection per provider
  - Research topic prompt
  - Loading spinner with rotating status messages while the AI researches
  - Structured research report output (overview, key points, context,
    takeaway)
  - Interactive follow-up chat loop, supporting `/exit` and `/help`
    commands
- Modular provider adapter system (`src/providers/`) supporting:
  - OpenAI (Chat Completions API)
  - Anthropic (Messages API)
  - Google Gemini (generateContent API)
- Provider-agnostic research/chat engine (`src/core/`) with conversation
  history management
- Graceful error handling for network issues, invalid keys, and provider
  API errors — no raw stack traces shown to the user
- npm workspaces monorepo structure (`packages/cli`) to support future
  packages
- Project documentation: README, CONTRIBUTING guide, Code of Conduct,
  Security Policy, and this Changelog

[Unreleased]: https://github.com/abjad-org/research-chef/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/abjad-org/research-chef/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/abjad-org/research-chef/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/abjad-org/research-chef/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/abjad-org/research-chef/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/abjad-org/research-chef/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/abjad-org/research-chef/releases/tag/v0.1.0