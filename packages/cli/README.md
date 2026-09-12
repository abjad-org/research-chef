# @abjad-org/research-chef

An interactive terminal AI research assistant with **BYOK** (Bring Your Own
Key) support, built with [`@clack/prompts`](https://github.com/natemoo-re/clack)
and [`picocolors`](https://github.com/alexeyraspopov/picocolors).

## Features

- 🔑 **BYOK** — bring your own API key for OpenAI, Anthropic (Claude),
  Google Gemini, or any OpenAI-compatible endpoint (Groq, Together AI,
  OpenRouter, a local Ollama server, self-hosted deployments, etc). No key
  ever leaves your machine except to call the provider's own API directly.
- 🛡️ **Verified before you start** — your API key and model are tested with
  a minimal request during setup, so problems surface immediately instead
  of after you've already typed out a research topic.
- 🔍 **One-shot research report** — enter a topic and get a clear, structured
  summary (overview, key points, context, takeaway) backed by live web
  search, with a clickable `Sources:` section (title + full URL) so every
  claim can be verified.
- 🗺️ **Outline-first reports** — approve, edit, or regenerate the proposed
  outline (sections + sub-questions) before the full report is written;
  navigate long reports with `/sections` and `/goto <number>`.
- 💬 **Interactive follow-up chat** — keep asking questions in the same
  session, switch models with `/model`, start fresh with `/clear`, or save
  the conversation with `/save` — until you type `/exit`.
- 🎨 **Polished terminal UI** — spinners, colored output, and boxed panels
  via `@clack/prompts` and `picocolors`.

## Getting started

### Install from npm (recommended for end users)

```bash
npx @abjad-org/research-chef
```

or install it globally:

```bash
npm install -g @abjad-org/research-chef
research-chef
```

### Run from source (for development)

From the monorepo root:

```bash
npm install
npm run build
npm start
```

Or in dev mode (no build step, powered by `tsx`):

```bash
npm run dev
```

## Usage walkthrough

1. **Welcome screen** — a short banner explains what the tool does.
2. **Connect your provider** — pick OpenAI, Anthropic, Gemini, or a Custom
   (OpenAI-compatible) endpoint, then paste your API key (input is masked).
   Optionally override the default model. For a custom endpoint, you'll
   also be asked for its base URL; if it looks like a local Ollama server,
   the API key can be left blank.
3. **Verification** — a quick, minimal request confirms your key and model
   actually work together before moving on, so problems are caught here
   rather than later.
4. **Enter a research topic** — e.g. *"The impact of AI on renewable energy
   adoption"*.
5. **Approve the outline** — review the proposed sections and guiding
   sub-questions, then approve, edit (your own headings separated by `;`),
   or regenerate before the full report is written.
6. **Research spinner** — a loading spinner plays while the AI puts together
   its answer, following your approved outline.
7. **Research report** — a structured, easy-to-read summary is printed in a
   boxed panel, ending with a `Sources:` list of full URLs. Built-in
   providers (OpenAI via the Responses API, Anthropic, Gemini) search the
   live web automatically; custom endpoints answer from the model's own
   knowledge (noted once, neutrally, during setup).
7. **Chat loop** — keep asking follow-up questions (auto-saved after every
   reply), or use a command:
    - `/model` — switch to a different AI model mid-conversation
    - `/clear` — clear the conversation and start a new topic
    - `/save` — export the conversation to a Markdown file under
      `~/.research-chef/exports/`
    - `/history [filter]` — list auto-saved sessions, optionally filtered by topic
    - `/resume <number>` — resume a past session from `/history`
    - `/sections` — list the sections of the current report
    - `/goto <number>` — jump to one section of the current report
    - `/help` — show all available commands
    - `/exit` — quit research-chef

Sessions are auto-saved as JSON under `~/.research-chef/sessions/` (API
keys are never written to disk). At startup, when past sessions exist,
you can resume one instead of starting fresh.

## Where does my API key go?

Your key is only ever used, in memory, for the duration of the CLI process
to call the selected provider's official HTTPS API directly from your
machine (`api.openai.com`, `api.anthropic.com`, or
`generativelanguage.googleapis.com`). It is **never** written to disk, sent
to any research-chef server (there isn't one), or logged.

## Project structure

```
src/
├── index.ts              # Entry point: wires the whole flow together
├── types/                # Shared TypeScript interfaces & error types
│   └── index.ts
├── providers/            # BYOK provider adapters (one file per provider)
│   ├── registry.ts       # Provider metadata (labels, default models, key format)
│   ├── factory.ts        # Maps a ProviderId -> concrete adapter
│   ├── openai.provider.ts
│   ├── anthropic.provider.ts
│   └── gemini.provider.ts
├── core/                 # Provider-agnostic research/chat logic
│   ├── prompts.ts        # System prompt & kickoff message templates
│   ├── citations.ts      # Dedupe/format/append for web-source citations
│   ├── outline.ts        # Outline parsing + report section navigation
│   ├── conversation.ts   # Conversation history state
│   ├── sessionStore.ts   # Auto-save/list/load/search for past sessions
│   └── engine.ts         # Orchestrates conversation + provider calls
└── ui/                   # clack + picocolors presentation layer
    ├── theme.ts          # Centralized colors & text wrapping helper
    ├── banner.ts         # Intro/outro screens
    ├── setup.ts          # Provider selection + API key prompt
    ├── topic.ts          # Research topic prompt
    ├── resumeStartup.ts  # Startup resume picker
    ├── outlineFlow.ts    # Outline approve/edit/regenerate loop
    ├── researchFlow.ts   # Spinner + initial research report
    ├── chatLoop.ts       # Interactive follow-up chat loop
    ├── render.ts         # Renders reports / replies / errors
    └── cancel.ts         # Shared Ctrl+C / Esc handling
└── ui/                   # clack + picocolors presentation layer
    ├── theme.ts          # Centralized colors & text wrapping helper
    ├── banner.ts         # Intro/outro screens
    ├── setup.ts          # Provider selection + API key prompt
    ├── topic.ts          # Research topic prompt
    ├── researchFlow.ts   # Spinner + initial research report
    ├── chatLoop.ts       # Interactive follow-up chat loop
    ├── render.ts         # Renders reports / replies / errors
    └── cancel.ts         # Shared Ctrl+C / Esc handling
```

## Adding a new provider

1. Create `src/providers/<name>.provider.ts` implementing the `AiProvider`
   interface (a `sendMessage()` and a `testConnection()` method).
2. Register its metadata (label, hint, default model, key format check) in
   `src/providers/registry.ts`.
3. Add it to the `ADAPTERS` map in `src/providers/factory.ts`.

No other file needs to change — the UI and engine work against the
`AiProvider` interface, not concrete providers.

> **Already OpenAI-compatible?** If the provider speaks the same
> `/chat/completions` request/response shape as OpenAI (many do — Groq,
> Together AI, OpenRouter, Ollama, etc.), you likely don't need a new
> adapter file at all. Reuse
> `createOpenAiCompatibleProvider(providerId, defaultBaseUrl)` from
> `src/providers/openai.provider.ts` instead, the same way
> `src/providers/custom.provider.ts` does.

## Scripts

| Script             | Description                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`       | Run the CLI directly from TypeScript source   |
| `npm run build`     | Compile TypeScript to `dist/`                 |
| `npm start`         | Run the compiled CLI from `dist/`             |
| `npm run typecheck` | Type-check without emitting files             |
| `npm run clean`     | Remove the `dist/` folder                     |