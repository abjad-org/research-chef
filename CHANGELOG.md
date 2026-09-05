# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet — this section will track changes as they land on `main` ahead
of the next release.

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

[Unreleased]: https://github.com/abjad-org/research-chef/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abjad-org/research-chef/releases/tag/v0.1.0