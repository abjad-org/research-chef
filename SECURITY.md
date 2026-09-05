# Security Policy

`research-chef` is a **BYOK (Bring Your Own Key)** command-line tool. That
means handling API keys responsibly is central to what this project does —
so we take security seriously and appreciate reports from the community.

## How research-chef handles your API key

Understanding this will help you evaluate the security of the tool and
report issues accurately:

- Your API key is entered once, interactively, at the start of a session
  (input is masked in the terminal).
- It is kept **only in memory** for the lifetime of that CLI process.
- It is used exclusively to call the official HTTPS API of the provider you
  selected, directly from your machine:
  - `https://api.openai.com` (OpenAI)
  - `https://api.anthropic.com` (Anthropic)
  - `https://generativelanguage.googleapis.com` (Google Gemini)
- research-chef has **no backend server** of its own. Your key and your
  research topics/conversations are never sent to, or stored by, any
  infrastructure operated by this project.
- The key is **never written to disk**, never logged, and never included in
  error messages or crash reports produced by the CLI.

If you ever observe behavior that contradicts any of the points above,
please treat it as a security vulnerability and report it using the process
below.

## Supported versions

`research-chef` is currently pre-0.1.0/early-stage and does not yet maintain
multiple long-term release branches. Security fixes are applied to the
latest released version on the `main` branch.

| Version | Supported |
| --- | --- |
| Latest (`main`) | ✅ |
| Older tagged releases | ❌ |

Once the project reaches a stable 0.1.x line with multiple maintained
versions, this table will be updated accordingly.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
This helps avoid exposing a vulnerability before a fix is available.

Instead, please report it privately using one of these methods:

1. **Preferred:** Use GitHub's [private vulnerability reporting](../../security/advisories/new)
   feature on this repository, if enabled.
2. **Alternative:** Open a new [GitHub Discussion](../../discussions) marked
   private/security if available, or contact a maintainer directly through
   their GitHub profile with a note asking for a private channel.

When reporting, please include as much of the following as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a minimal proof of concept
- The version/commit of research-chef you tested against
- Any suggested mitigation, if you have one

### What to expect

- We'll acknowledge your report as soon as we reasonably can.
- We'll investigate and keep you updated on progress.
- Once a fix is ready, we'll coordinate on disclosure timing with you before
  making any public details available.
- We'll credit you in the release notes, unless you'd prefer to remain
  anonymous.

## Good practices for users

While using research-chef, we recommend:

- **Use API keys with the minimum necessary permissions/spending limits**
  your provider allows, in case a key is ever compromised through means
  unrelated to this tool (e.g. a compromised machine).
- **Never commit your API key** to version control, shell history files
  meant to be shared, or scripts you intend to publish.
- **Rotate your key periodically**, especially if you suspect it may have
  been exposed.
- Keep your Node.js installation and dependencies up to date by running
  `npm install` after pulling the latest changes.

Thank you for helping keep research-chef and its users safe! 🔒