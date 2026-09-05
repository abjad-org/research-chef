# @abjad-org/research-chef

An interactive terminal AI research assistant with **BYOK** (Bring Your Own
Key) support, built with [`@clack/prompts`](https://github.com/natemoo-re/clack)
and [`picocolors`](https://github.com/alexeyraspopov/picocolors).

## Features

- 🔑 **BYOK** — bring your own API key for OpenAI, Anthropic (Claude), or
  Google Gemini. No key ever leaves your machine except to call the
  provider's official API directly.
- 🔍 **One-shot research report** — enter a topic and get a clear, structured
  summary (overview, key points, context, takeaway).
- 💬 **Interactive follow-up chat** — keep asking questions in the same
  session until you type `/exit`.
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
2. **Connect your provider** — pick OpenAI, Anthropic, or Gemini, then paste
   your API key (input is masked). Optionally override the default model.
3. **Enter a research topic** — e.g. *"The impact of AI on renewable energy
   adoption"*.
4. **Research spinner** — a loading spinner plays while the AI puts together
   its answer.
5. **Research report** — a structured, easy-to-read summary is printed in a
   boxed panel.
6. **Chat loop** — keep asking follow-up questions. Type `/exit` at any time
   to end the session, or `/help` for a reminder of the commands.

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
│   ├── conversation.ts   # Conversation history state
│   └── engine.ts         # Orchestrates conversation + provider calls
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
   interface (a single `sendMessage()` method).
2. Register its metadata (label, hint, default model, key format check) in
   `src/providers/registry.ts`.
3. Add it to the `ADAPTERS` map in `src/providers/factory.ts`.

No other file needs to change — the UI and engine work against the
`AiProvider` interface, not concrete providers.

## Scripts

| Script             | Description                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`       | Run the CLI directly from TypeScript source   |
| `npm run build`     | Compile TypeScript to `dist/`                 |
| `npm start`         | Run the compiled CLI from `dist/`             |
| `npm run typecheck` | Type-check without emitting files             |
| `npm run clean`     | Remove the `dist/` folder                     |