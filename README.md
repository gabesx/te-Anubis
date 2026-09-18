# TE-Anubis

**The Strict PR Quality Gate.**

An open-source, AI-powered code review agent. Context-aware, skill-driven, provider-agnostic —
built to produce a handful of high-signal findings instead of thirty speculative ones. Works as a
local CLI today; GitHub PR integration and a safety-gated fix mode are built on top of the same
engine (see [`docs/architecture.md`](docs/architecture.md)).

## Quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/gabesx/te-Anubis/main/install.sh | bash

export GEMINI_API_KEY=...   # or ANTHROPIC_API_KEY / OPENAI_API_KEY — whichever you have,
                             # checked in that order (see "AI providers" below)
anubis review --base HEAD~1 --head HEAD
```

There's no published npm package yet, so [`install.sh`](install.sh) builds from source (needs
Node.js ≥20 already on your machine) and symlinks `anubis` into `~/.local/bin` — re-run it any
time to update. Prefer to build it yourself instead:

```bash
git clone git@github.com:gabesx/te-Anubis.git && cd te-Anubis
npm install && npm run build
node bin/anubis.js review --base HEAD~1 --head HEAD
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
anubis review --debug                             # dump raw AI prompts/responses to .anubis-debug/ (local only)
```

Skills auto-detect from repo signals (`wdio.conf.*`, package dependencies, etc.) — see
[`skills/`](skills/) for the four shipped skills and
[`docs/writing-skills.md`](docs/writing-skills.md) to add your own. Configure via `.anubis.yml`
at the repo root (see the one in this repo for every available option).

To point Anubis at a project other than this one (CLI or GitHub Actions), see
[`docs/local-setup.md`](docs/local-setup.md).

### AI providers

`ai.provider` defaults to `auto`: whichever of `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` is actually set gets used, checked in that order — set an explicit
`--provider`/`.anubis.yml` value to pin one. Anthropic Claude is the most fully-implemented
provider; OpenAI and Gemini are real, working implementations that are intentionally thinner
(no streaming, less cost-accounting nuance).

## GitHub integration

Three workflows in [`.github/workflows/`](.github/workflows/): `ci.yml` runs this repo's own test
suite/lint/typecheck/build on every PR (no secrets needed — everything's mocked); `anubis-review.yml`
posts inline + summary review comments on every PR to a repo that installs Anubis;
`anubis-command.yml` handles `/anubis review [skill]` and `/anubis explain` PR comments (`/anubis fix`
isn't wired up yet — see [`docs/architecture.md`](docs/architecture.md) for why). The latter two need
at least one of `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` configured as a repo secret
(provider auto-detection applies here too).

## Development

```bash
npm test              # vitest — unit + a mocked end-to-end pipeline test, no live network calls
npm run test:coverage  # same, with a coverage report
npm run lint            # eslint, including the core/ import-boundary rule
npm run typecheck
npm run build           # tsup -> dist/cli/index.js
```

## Status

CLI review engine, AI provider layer (Anthropic full; OpenAI/Gemini thin-but-real), skill
auto-detection, GitHub PR review + comment commands, and a rule-based, fail-closed Fix Engine
(local `--fix`/`--suggest-fixes`) are implemented and tested — a formal security audit pass has
also run against the whole codebase (see `history.log`). 260+ tests, ~96% statement coverage. See
[`docs/architecture.md`](docs/architecture.md) for the full picture and what's deliberately not
built yet (noise-reduction tuning needs real usage data; GitHub-side `/anubis fix`).
