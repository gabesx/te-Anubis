# TE-Anubis Architecture

A working reference to how the pieces fit together, why they're split the way they are, and the
safety invariants that must not be casually relaxed. See the repo's plan history for the full
phase-by-phase rationale; this doc is the living summary.

## Module boundaries

```
src/
  cli/        — commander entry point, config loading, the three CLI commands
  core/       — the review engine: pipeline, providers, skills, context, validation, reporting
    seams/    — interfaces GitHub/Fix implement; core never imports them back
  github/     — GitHub Integration (Phase 6): posts reviews, handles /anubis commands
  fix/        — Fix Engine (Phase 8): classifies, validates, applies, and commits SAFE fixes
```

`core/` must never import from `cli/`, `github/`, or `fix/` — enforced by an ESLint rule
(`eslint.config.js`). GitHub Integration and the Fix Engine are additive layers built *on top of*
the review engine; the engine has no idea either exists. If you find yourself importing `core/`
into one of the additive layers, that's the right direction. The reverse is a bug.

## Review pipeline

One sequential array of 11 stages (`core/pipeline/pipeline.ts`, `core/pipeline/stages/`), run via
`runPipeline`. No DAG, no conditional branching — each stage is independently unit-testable by
calling `stage.run(fixtureCtx)` directly.

```
repository-discovery → git-diff-analysis → file-classification → skill-resolution
  → context-retrieval → static-analysis-ingestion → ai-review → finding-validation
  → deduplication → severity-classification → report-output
```

`ai-review` is map-reduce: one AI request per changed file (bounded concurrency via `p-limit`),
never one giant request for the whole diff. Findings are validated by five rule-based gates
(`core/validation/finding-validator.ts`), deduplicated (`dedup.ts`), severity-classified
(`severity-engine.ts`), and capped by `review.max_comments` in `report-output` — noise reduction
is structural (config-driven caps and gates), not just a prompt instruction.

Three entry points share this pipeline via `cli/commands/run-review-pipeline.ts`: the local CLI
`review` command, the GitHub `pull_request`-triggered review, and GitHub `/anubis review` comment
commands. They differ only in where `baseRef`/`headRef` come from and how the `ReviewResult` gets
rendered.

## AI Provider Layer

`core/providers/provider-factory.ts` is the only place that knows about concrete providers.
Anthropic Claude is the fully-implemented default; OpenAI and Gemini are real, working, but
intentionally thin (no streaming, default SDK retry behavior, a one-time "MVP-minimal" warning on
first use). Switching provider is a config change, never a review-logic change.

## Skill Engine

`skills/<id>/SKILL.md` = YAML frontmatter (validated against a zod schema) + a markdown body
injected verbatim into the AI prompt. Auto-detection (`core/skills/detector.ts`) requires every
`required` signal to match and, if any `supporting` signals exist, at least one of those too —
this is what lets `review-wdio-api-automation` and `review-wdio-apps-automation` both key off
`wdio.conf.*` without both firing on every WDIO repo. See `docs/writing-skills.md` to add one.

## GitHub Integration (`src/github/`)

Two separate workflows, and the split is the actual security boundary, not incidental structure:

- **`.github/workflows/anubis-review.yml`** — `pull_request` trigger, **never**
  `pull_request_target`. GitHub structurally withholds secrets and issues a read-only token to
  fork-originated `pull_request` runs — that's what makes it safe to check out and analyze
  untrusted PR content directly. A fork PR that can't get an AI review because of this (no
  provider key available) gets an informative comment instead of a crash
  (`cli/commands/github-review.ts`).
- **`.github/workflows/anubis-command.yml`** — `issue_comment` trigger, which does **not** get the
  same automatic secret-stripping for fork PRs. This workflow checks out Anubis's own trusted
  source at the primary path (what gets `npm ci`'d and built) and the commenting PR's head content
  into a *separate* `target-repo` directory that is only ever read as data — never installed,
  never executed. Collapsing these into one checkout would recreate the classic "pwn request"
  vulnerability: a malicious fork PR's `postinstall` script running in a job that holds
  `GITHUB_TOKEN`/`ANTHROPIC_API_KEY`. **Do not merge these checkouts without re-reading this
  section first.**

Command authorization (`src/github/authorization.ts`) is checked against the commenter's *live*
collaborator permission on every invocation, never cached, never trusted from the payload alone.
`/anubis fix` needs write+; `/anubis review`/`/anubis explain` only need read+.

Idempotency: inline comments are matched by an embedded `<!-- anubis:finding:<id> --> ` marker
(a re-run never reposts one already there); the summary comment is found by its own marker and
updated in place. Both markers are public, hardcoded strings — anyone who can comment on the PR
could post one themselves, so every marker scan is filtered to comments authored by the bot's own
login (`GitHubIntegration`'s `botLogin`, defaulting to `github-actions[bot]`) before trusting a
match; otherwise any commenter could forge the summary marker to overwrite the bot's own comment,
or forge a finding marker to permanently suppress a specific finding. (`botLogin` is *not* looked
up dynamically via `GET /user` — that endpoint requires user-to-server auth and rejects the
`GITHUB_TOKEN` App-installation token this runs with; pass an explicit login if using a custom
bot/PAT identity instead.) Separately, every AI-derived string embedded in a comment body
(`finding.title`/`problem`/`rationale`/`suggestion`/`evidence`) is passed through
`sanitizeAiText` first, which neutralizes marker-shaped syntax and caps length — this closes the
gap where a successful prompt injection could otherwise get the model to emit marker syntax
inside an otherwise-legitimate, bot-authored comment.

## Fix Engine (`src/fix/`)

The highest-risk component — a bad auto-commit is the worst-case failure mode — so it's built
fail-closed on purpose:

```
finding.suggestedDiff present?
  → classifyFixSafety (rule-based only, no AI self-assessment input)
      UNSAFE            → skipped, described only, never touched
      REVIEW_REQUIRED   → suggested (diff shown, never applied)
      SAFE + mode=fix   → validatePatch (applies cleanly? in-scope? not denylisted?)
                            invalid → skipped
                            valid   → applyPatches → runSandboxChecks → commitFixes
                                        any step fails → revertFiles, skipped
```

Safety classification (`safety-classifier.ts`) only recognizes three narrow, verifiable diff
shapes as SAFE-eligible: whitespace-only, unused-import-removal-only, and assertion-addition-only.
The whitespace-only check compares added/removed lines *positionally*, not as a sorted set — a
statement-reorder (e.g. swapping two lines, which can be a real behavioral change) is deliberately
not treated as "the same lines, therefore safe." Everything else fails closed to
`REVIEW_REQUIRED` — there is no generic "looks simple enough" fallback. A file path denylist
(secrets, keys, CI workflows, auth/payment/billing/crypto paths — `denylist.ts`) forces `UNSAFE`
regardless of diff shape. Confidence below 0.85 and diffs over 30 changed lines both downgrade an
otherwise-SAFE-shaped patch to `REVIEW_REQUIRED`.

`patch-validator.ts` is a second, independent structural gate (defense in depth, not trusting the
classifier's own math) — both import the *same* `denylist.ts` rather than hand-maintaining
separate copies (which had drifted apart before an audit caught it). It resolves every touched
path against the repo root with `realpath`-based symlink-escape detection, rejects a patch that
creates or modifies a symlink outright (a not-yet-existing path can't be realpath-checked, so a
symlink-mode diff is refused regardless of shape), rejects anything outside the repo or matching
the denylist, and confirms the patch is scoped to exactly the finding's own file and applies
cleanly via `git apply --check`.

`git-commit-engine.ts` never uses `--force`, never rewrites history (always a new commit on top of
HEAD), stages only the touched files (never `git add -A`), and **never pushes** — `commit.pushed`
is always `false` from `FixEngine.run()`. Pushing is left to the caller as an explicit, separate
decision (`pushCommit()`), since whether it's appropriate differs between a local CLI run and a
GitHub PR context. GitHub's `/anubis fix` currently responds that fix mode isn't wired up there
yet, specifically because push-to-PR-branch is exactly the kind of hard-to-reverse, externally
visible action that deserves its own deliberate review before shipping — the local CLI
`--fix`/`--suggest-fixes` flags exercise the full classify → validate → sandbox → commit pipeline
today.

## Observability

`RunMetrics` (run id, tokens, cost, findings generated/rejected/final, per-stage durations) is
threaded through every stage. `utils/logger.ts`'s `redact()` strips known secret patterns and
configured env var values before text reaches a sink — applied not just to `logger.*` calls but
to every top-level CLI output path (`cli/index.ts`'s `printError`, both report renderers, the
`--fix` result printer), since an error message or a subprocess's stderr is exactly where a leaked
key is most likely to surface unnoticed.

## Subprocess argument safety

`utils/exec.ts`'s `run()` (argv array, `shell: false`) is necessary but not sufficient on its
own: a changed-file path from an untrusted PR's diff can still be *interpreted as a flag* by the
tool it's passed to if it isn't clearly separated from the option list first (e.g. a file literally
named `--rulesdir=...`). Every call site that passes repo-controlled file paths as trailing
arguments — `static-analysis-ingestion.ts`'s and `sandbox-runner.ts`'s eslint invocations,
`git-commit-engine.ts`'s `git add`/`git checkout` — puts a literal `'--'` before the path list for
exactly this reason. Adding a new subprocess call site that takes a list of repo-controlled paths
should follow the same pattern.
