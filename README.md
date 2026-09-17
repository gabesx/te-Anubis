# TE-Anubis

**The Strict PR Quality Gate.**

An open-source, AI-powered code review agent. Context-aware, skill-driven, provider-agnostic —
built to produce a handful of high-signal findings instead of thirty speculative ones. Works as a
local CLI today; GitHub PR integration and a safety-gated fix mode are built on top of the same
engine (see [`docs/architecture.md`](docs/architecture.md)).

## Quickstart

```bash
npm install
npm run build

export ANTHROPIC_API_KEY=sk-ant-...
node bin/anubis.js review --base HEAD~1 --head HEAD
```

Once published, this becomes:

```bash
npx te-anubis review
```

## Usage

```bash
anubis review                                   # review the diff between HEAD~1 and HEAD
anubis review --base main --head HEAD           # review against a specific base
anubis review --skill review-wdio-api-automation # scope to one skill
anubis review --provider openai                 # switch AI provider
anubis review --json                             # machine-readable output
anubis review --suggest-fixes                    # show proposed fixes, apply nothing
anubis review --fix                               # commit SAFE-classified fixes locally (never pushes)
```

Skills auto-detect from repo signals (`wdio.conf.*`, package dependencies, etc.) — see
[`skills/`](skills/) for the four shipped skills and
[`docs/writing-skills.md`](docs/writing-skills.md) to add your own. Configure via `.anubis.yml`
at the repo root (see the one in this repo for every available option).

## GitHub integration

Two workflows in [`.github/workflows/`](.github/workflows/) — `anubis-review.yml` posts inline +
summary review comments on every PR; `anubis-command.yml` handles `/anubis review [skill]` and
`/anubis explain` PR comments (`/anubis fix` isn't wired up yet — see
[`docs/architecture.md`](docs/architecture.md) for why). Requires an `ANTHROPIC_API_KEY` repo
secret.

## Development

```bash
npm test        # vitest — unit + a mocked end-to-end pipeline test, no live network calls
npm run lint     # eslint, including the core/ import-boundary rule
npm run typecheck
npm run build    # tsup -> dist/cli/index.js
```

## Status

CLI review engine, AI provider layer (Anthropic full; OpenAI/Gemini thin-but-real), skill
auto-detection, GitHub PR review + comment commands, and a rule-based, fail-closed Fix Engine
(local `--fix`/`--suggest-fixes`) are implemented and tested. See
[`docs/architecture.md`](docs/architecture.md) for the full picture and what's deliberately not
built yet.
