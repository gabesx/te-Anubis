# Using TE-Anubis on another project

Quick guide for pointing TE-Anubis at a project other than itself. Two setups: the CLI (works
today, no caveats) and GitHub Actions (works today, but it's a manual pattern — there's no
published npm package or reusable composite action yet, so you're copying and adapting a workflow
file rather than installing a package).

## 1. CLI, against any local repo

This is the fastest path and needs nothing from the target project itself.

```bash
git clone git@github.com:gabesx/te-Anubis.git
cd te-Anubis
npm install
npm run build

export GEMINI_API_KEY=...      # or ANTHROPIC_API_KEY / OPENAI_API_KEY — whichever you have;
                                 # ai.provider defaults to "auto" and checks them in that order

node bin/anubis.js review \
  --repo /path/to/your-project \
  --base main \
  --head HEAD
```

That's it — `--repo` points Anubis at any git repository on disk; it doesn't need to be checked
out inside TE-Anubis's own directory. Useful flags:

```bash
--skill review-wdio-api-automation   # scope to one skill instead of auto-detection
--json                                # machine-readable output
--suggest-fixes                       # show proposed fixes, apply nothing
--fix                                 # commit SAFE-classified fixes locally (never pushes)
--debug                               # dump raw AI prompts/responses to .anubis-debug/ (local only)
```

### Optional: configure your project

Drop a `.anubis.yml` at your project's root (copy the one in this repo as a starting template) to
set `review.max_comments`, pin `skills.enabled`, disable auto-detection, etc. Anubis reads it from
whatever `--repo` points at, not from TE-Anubis's own directory.

Want a project-specific skill? Add `.anubis/skills/<id>/SKILL.md` inside *your* project — it loads
the same way a bundled skill does and overrides a bundled one with the same `id`. See
[`docs/writing-skills.md`](writing-skills.md).

## 2. GitHub Actions, on another repo

TE-Anubis isn't published as an npm package or a reusable Action yet, so "installing" it into
another repo today means fetching its source as a second checkout in your own workflow and
building it there — never the other way around. The one rule that matters:
**only ever `npm ci`/build inside the TE-Anubis checkout, never inside your own project's
checkout** — that's what keeps a PR to *your* repo from being able to run arbitrary code in a job
holding your secrets. See [`docs/architecture.md`](architecture.md)'s security section for the
full reasoning (`pull_request` vs `pull_request_target`, the "pwn request" pattern).

`.github/workflows/anubis-review.yml` in **your** project:

```yaml
name: Anubis Review
on:
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout this repo's PR head
        uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - name: Checkout TE-Anubis
        uses: actions/checkout@v7
        with:
          repository: gabesx/te-Anubis
          ref: main   # pin to a commit SHA for real use — see the security note in this repo's own workflows
          path: .te-anubis

      - uses: actions/setup-node@v7
        with:
          node-version: 20

      - name: Build TE-Anubis (never your own project)
        run: cd .te-anubis && npm ci && npm run build

      - name: Run Anubis review
        run: node .te-anubis/bin/anubis.js github-review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Configure at least one of those three secrets on your repo (`gh secret set GEMINI_API_KEY`, piped
via stdin rather than passed as an argument, so it never lands in shell history).

`/anubis review|explain` PR comments follow the same shape as this repo's own
`.github/workflows/anubis-command.yml`, with one difference: make **TE-Anubis** the primary
checkout (no `path:`) and **your** project's PR head the untrusted, read-only one (`path:
target-repo`, `persist-credentials: false`), then pass `ANUBIS_TARGET_REPO: target-repo` in the
env block — that env var exists specifically so a "reviewer" checkout and a "target" checkout can
be different repos. Copy this repo's `anubis-command.yml` and swap which checkout is which; the
`github-command` CLI subcommand already supports this.

`/anubis fix` isn't wired up on the GitHub side yet regardless of which repo you run this from
(see `docs/architecture.md`) — `--fix`/`--suggest-fixes` on the local CLI are the only way to
exercise the Fix Engine today.
