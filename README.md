# 🍳 research-chef

**An interactive AI research assistant for your terminal — bring your own API key, ask anything, and keep the conversation going.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/%40abjad-org%2Fresearch-chef.svg)](https://www.npmjs.com/package/@abjad-org/research-chef)
[![CI](https://github.com/abjad-org/research-chef/actions/workflows/ci.yml/badge.svg)](https://github.com/abjad-org/research-chef/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178c6)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

---

`research-chef` turns your terminal into a research kitchen. Pick your favorite AI provider, paste in your own API key, ask about anything you're curious about, and get a clear, well-organized report back — then keep chatting to dig deeper, all without leaving the command line.

```
   ____                              _        ____ _          __
  |  _ \ ___  ___  ___  __ _ _ __ ___| |__     / ___| |__   ___ / _|
  | |_) / _ \/ __|/ _ \/ _` | '__/ __| '_ \   | |   | '_ \ / _ \ |_
  |  _ <  __/\__ \  __/ (_| | | | (__| | | |  | |___| | | |  __/  _|
  |_| \_\___||___/\___|\__,_|_|  \___|_| |_|   \____|_| |_|\___|_|
```

## ✨ Features

- 🔑 **BYOK (Bring Your Own Key)** — use your own OpenAI, Anthropic (Claude), or Google Gemini API key. Your key never touches any research-chef server, because there isn't one — everything runs locally on your machine.
- 📋 **Structured research reports** — every topic gets a clear overview, key points, relevant context, and a practical takeaway, instead of a wall of text.
- 💬 **Interactive follow-up chat** — the conversation doesn't end at the first answer. Ask "why", ask for examples, ask it to go deeper — right in the same session.
- 🎨 **Pleasant terminal UI** — smooth prompts, spinners, and colors powered by [`@clack/prompts`](https://github.com/natemoo-re/clack) and [`picocolors`](https://github.com/alexeyraspopov/picocolors).
- 🧩 **Modular by design** — adding support for a new AI provider takes three small, isolated steps. See [Adding a new provider](./packages/cli/README.md#adding-a-new-provider).

## 📦 Requirements

- [Node.js](https://nodejs.org) **v18.17 or newer**
- An API key from at least one supported provider:
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic (Claude)](https://console.anthropic.com/settings/keys)
  - [Google Gemini](https://aistudio.google.com/app/apikey)

You only need a key for the provider you actually want to use.

## 🚀 Quick start

The easiest way to try research-chef is with `npx` — no install needed:

```bash
npx @abjad-org/research-chef
```

Or install it globally so the `research-chef` command is always available:

```bash
npm install -g @abjad-org/research-chef
research-chef
```

### Running from source

If you'd rather run it from source (e.g. to contribute or customize it):

```bash
git clone https://github.com/abjad-org/research-chef.git
cd research-chef
npm install
npm run build
npm start
```

Prefer to skip the build step while developing? Run it straight from TypeScript:

```bash
npm run dev
```

## 🖥️ How it works

1. **Welcome screen** — research-chef greets you and explains what's about to happen.
2. **Connect your provider** — choose OpenAI, Anthropic, or Gemini, then paste your API key (it's masked as you type). You can optionally pick a specific model.
3. **Ask your research topic** — type anything you want to learn about.
4. **Sit back for a moment** — a loading spinner plays while the AI puts your report together.
5. **Read your report** — a clean summary appears: overview, key points, context, and takeaway.
6. **Keep the conversation going** — ask follow-up questions for as long as you like. Type `/exit` when you're done, or `/help` for a quick reminder of the available commands.

## 🔒 Is my API key safe?

Yes. Your key is used only in memory for the current session, to call the official API of the provider you chose, directly from your own machine. It is never written to disk, logged, or sent anywhere except that provider's official endpoint. See [SECURITY.md](./SECURITY.md) for full details and how to report a vulnerability.

## 🗂️ Project structure

This repository is organized as an **npm workspaces monorepo**, which keeps the door open for future packages (for example, a shared `@abjad-org/research-chef-core` package reused by a future GUI) without a big restructure later.

```
research-chef/
├── package.json               # workspace root
└── packages/
    └── cli/                   # the research-chef CLI application
        ├── bin/                # executable entry point
        └── src/
            ├── index.ts        # orchestrates the full flow
            ├── types/          # shared TypeScript types
            ├── providers/      # BYOK provider adapters
            ├── core/           # research/chat engine & conversation state
            └── ui/             # clack + picocolors presentation layer
```

For a deeper look at the architecture and how to extend it, see the [CLI package README](./packages/cli/README.md).

## 📚 Documentation

| Document | What it covers |
| --- | --- |
| [packages/cli/README.md](./packages/cli/README.md) | CLI architecture, usage details, adding new providers |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to set up your dev environment and submit changes |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Our community standards |
| [SECURITY.md](./SECURITY.md) | Supported versions and how to report vulnerabilities |
| [CHANGELOG.md](./CHANGELOG.md) | Notable changes across releases |

## 🤝 Contributing

Contributions, bug reports, and feature ideas are all welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) to get started — it covers everything from setting up the project locally to our commit message style.

New to the project? Look for issues labeled [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## 🚢 Releasing (maintainers)

New versions are published to npm automatically by [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) whenever a `v*.*.*` tag is pushed:

```bash
# 1. Bump the version in packages/cli/package.json (and root package.json)
# 2. Add a new entry to CHANGELOG.md
# 3. Commit the changes
git add packages/cli/package.json package.json CHANGELOG.md
git commit -m "chore: release v0.1.0"

# 4. Tag and push
git tag v0.1.0
git push origin main --tags
```

The workflow will type-check, build, verify the tag matches `package.json`, and publish `@abjad-org/research-chef` to npm.

## 📄 License

This project is licensed under the [MIT License](./LICENSE) — you're free to use, modify, and distribute it.

## 🙏 Acknowledgements

- [`@clack/prompts`](https://github.com/natemoo-re/clack) for the beautiful interactive prompts
- [`picocolors`](https://github.com/alexeyraspopov/picocolors) for tiny, fast terminal colors