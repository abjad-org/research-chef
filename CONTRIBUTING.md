# Contributing to research-chef

First off, thank you for considering contributing to `research-chef`! 🎉
Whether it's a bug report, a new feature, a documentation fix, or just a
question — all contributions are welcome and appreciated.

This guide will help you get set up and explain how we like to work.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Project structure](#project-structure)
- [Getting set up locally](#getting-set-up-locally)
- [Development workflow](#development-workflow)
- [Coding style](#coding-style)
- [Commit message convention](#commit-message-convention)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)
- [Adding a new AI provider](#adding-a-new-ai-provider)

## Code of Conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it. Please be kind and respectful — we
want this to be a welcoming space for everyone, regardless of experience
level.

## Ways to contribute

You don't need to write code to help out. Here are a few ways to contribute:

- 🐛 Report bugs you run into
- 💡 Suggest new features or improvements
- 📝 Improve documentation (typos, unclear wording, missing examples)
- 🧪 Add or improve tests
- 🔌 Add support for a new AI provider
- 👀 Review open pull requests

## Project structure

`research-chef` is an npm workspaces monorepo:

```
research-chef/
├── package.json               # workspace root — scripts run against the cli package
└── packages/
    └── cli/                    # the CLI application
        ├── bin/                 # executable entry point
        └── src/
            ├── index.ts         # orchestrates the full flow
            ├── types/           # shared TypeScript types
            ├── providers/       # BYOK provider adapters (OpenAI, Anthropic, Gemini)
            ├── core/            # provider-agnostic research/chat engine
            └── ui/              # clack + picocolors presentation layer
```

If you're not sure where a change belongs, feel free to open a draft PR or
a discussion issue and ask — we're happy to point you in the right direction.

## Getting set up locally

You'll need [Node.js](https://nodejs.org) **v18.17 or newer**.

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/abjad-org/research-chef.git
cd research-chef

# 2. Install dependencies for all workspace packages
npm install

# 3. Run the CLI directly from TypeScript source (no build step needed)
npm run dev
```

Since this is a BYOK tool, you'll need an API key from at least one
supported provider (OpenAI, Anthropic, or Gemini) to actually test the
research/chat flow end to end. Free-tier keys work fine for development.

## Development workflow

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the CLI straight from TypeScript source using `tsx` — fastest way to iterate |
| `npm run build` | Compiles TypeScript into `packages/cli/dist` |
| `npm start` | Runs the compiled CLI from `dist` (run `build` first) |
| `npm run typecheck` | Type-checks the project without emitting any files |
| `npm run clean` | Removes the `dist` folder |

Before opening a pull request, please make sure:

```bash
npm run typecheck
npm run build
```

both complete without errors.

## Coding style

We don't have an automated linter/formatter configured yet (contributions to
add one, e.g. ESLint + Prettier, are very welcome!). In the meantime, please
try to match the existing style:

- **TypeScript, strict mode.** Avoid `any` where a real type is reasonably
  achievable.
- **Comments in English**, explaining *why* something is done when it's not
  obvious, not just restating *what* the code does.
- **Small, focused modules.** Each file under `src/ui`, `src/core`, and
  `src/providers` should have one clear responsibility. If a file starts
  doing two unrelated things, consider splitting it.
- **No secrets in code.** Never hardcode an API key, even a test one, in
  committed code.
- **Prefer explicit over clever.** This is a learning-friendly codebase —
  readability wins over terseness.

## Commit message convention

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short summary>

[optional longer description]
```

Common types:

- `feat:` — a new feature
- `fix:` — a bug fix
- `docs:` — documentation-only changes
- `refactor:` — code change that doesn't fix a bug or add a feature
- `test:` — adding or updating tests
- `chore:` — tooling, dependency bumps, config changes

Examples:

```
feat: add support for Mistral as a provider
fix: handle empty API key input on retry
docs: clarify BYOK data-handling in README
```

This isn't strictly enforced, but it keeps the history easy to read and
helps us write better changelogs.

## Submitting a pull request

1. Create a new branch from `main` with a descriptive name, e.g.
   `feat/add-mistral-provider` or `fix/chat-loop-empty-input`.
2. Make your changes, following the guidelines above.
3. Run `npm run typecheck` and `npm run build` to confirm everything still
   compiles.
4. Test the CLI flow manually (`npm run dev`) to make sure your change
   behaves as expected end to end.
5. Push your branch and open a pull request against `main`.
6. Fill in the pull request template — describe what changed and why, and
   link any related issue.
7. Our CI workflow will automatically run `typecheck` and `build` on your
   pull request (Node.js 18.17 and 20.x). Please make sure it passes —
   you'll see the status right on the PR page.
8. Be responsive to review feedback. We'll do our best to review promptly
   and kindly.

Small, focused pull requests are easier to review and merge than large ones
that touch many things at once — when in doubt, split it up.

## Reporting bugs

Found something broken? Please [open an issue](../../issues/new/choose)
using the **Bug report** template. The more detail you can share, the
faster we can help:

- What you expected to happen vs. what actually happened
- Steps to reproduce
- Your OS, Node.js version, and which provider you were using
- Any error messages (feel free to redact your API key if it appears —
  though it shouldn't, since keys are never logged)

## Suggesting features

Have an idea? [Open an issue](../../issues/new/choose) using the **Feature
request** template. Tell us about the problem you're trying to solve, not
just the solution — sometimes there's a simpler way to get you there.

## Adding a new AI provider

This is one of the most valuable contributions you can make! Thanks to the
adapter pattern used in `src/providers/`, it only takes three steps:

1. **Create the adapter** — add `src/providers/<name>.provider.ts`
   implementing the `AiProvider` interface (a single `sendMessage()`
   method that calls the provider's API and returns plain text).
2. **Register the metadata** — add an entry to `PROVIDERS` in
   `src/providers/registry.ts` with the provider's label, hint, default
   model, and a basic API key format check.
3. **Wire it up** — add it to the `ADAPTERS` map in
   `src/providers/factory.ts`.

That's it — the UI and the research/chat engine work against the
`AiProvider` interface, so no other files need to change. See the existing
`openai.provider.ts`, `anthropic.provider.ts`, and `gemini.provider.ts` for
reference implementations.

---

Thanks again for contributing — we're excited to see what you build! 🍳