# Writing a skill

A skill is `skills/<id>/SKILL.md`: YAML frontmatter the engine parses, plus a markdown body that's
injected verbatim into the AI review prompt for any file it matches. The body is never further
parsed — write it for the model to read, not for code to introspect.

## Frontmatter

```yaml
---
id: review-my-framework
name: My Framework Review
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.myext.ts"      # glob patterns matched against changed file paths
  frameworks:               # optional, informational only today
    - my-framework
detectionSignals:            # optional — omit entirely for a skill that's only ever manually enabled
  - type: file-glob           # file-exists | file-glob | package-dependency | config-key
    value: "myframework.conf.*"
    required: true            # every `required` signal must match
  - type: package-dependency
    value: my-framework-cli    # non-required ("supporting") signals: at least one must match
defaultSeverityBias:          # optional — override the built-in per-category severity defaults
  some-category: HIGH
autoFixable: false            # a bias, not a guarantee — see core/validation/severity-engine.ts
                               # and src/fix/safety-classifier.ts for how findings actually get
                               # classified regardless of this flag
---
```

**Detection semantics**: a skill with no `detectionSignals` is never auto-detected — it only
activates via `skills.enabled` in `.anubis.yml` (or `--skill <id>`). This is how `code-convention`
works: no signals, always-on by config default. A skill *with* signals activates when every
`required` signal matches **and**, if any non-required ("supporting") signals exist, at least one
of those also matches. That's what lets two skills key off the same base signal (e.g. a config
file's presence) without both firing on every matching repo — give the more specific skill an
extra `required` signal (see `review-wdio-apps-automation`'s `@wdio/appium-service` dependency
check) rather than relying on supporting signals alone to disambiguate.

`config-key` signals are a pragmatic textual search, not a real config parser: `value` is
`"<filename>:<substring>"`, checked case-insensitively against a small set of well-known
repo-root config files (see `KNOWN_CONFIG_FILES` in `core/repo/manifest-reader.ts`). Prefer
`package-dependency` when you can — it's far more reliable than grepping a config file's text.

## Body

Structure it however reads best to an LLM reviewer; the four shipped skills follow this shape and
it's a reasonable default:

- **What this skill reviews** — one paragraph of scope.
- **Expected architecture** — the pattern a correct implementation follows.
- **Conventions** — specific, checkable rules.
- **Anti-patterns** — named, concrete failure modes (not "write good code").
- **Severity guidance** — which categories map to which severities *for this skill specifically*.
- **Review checklist** — a short checklist the model can walk through per file.
- **Examples** — a bad/good pair, real code, not prose description.
- **Auto-fix policy** — one paragraph on whether/why this skill's findings are usually mechanical.

Keep it concrete and falsifiable. "Don't write bad tests" produces noise; "every request under
test asserts the expected status code" produces a specific, checkable finding.

## Composition

Multiple skills matching the same changed file are combined into **one** AI request for that
file, not one request per skill — each matched skill's body appears under its own
`## Skill: <id>` heading in the prompt, and the model is told every finding must name which skill
it came from. This is why bodies should stay reasonably scoped: a file matching three verbose
skills shares one token budget across all three.

## Repo-local skills

Anything under `<target-repo>/.anubis/skills/<id>/SKILL.md` loads the same way as a bundled skill
and overrides a bundled skill with the same `id`. Useful for a project-specific convention that
doesn't belong in this repo.

## Testing a new skill

Add a fixture repo under `test/fixtures/repos/` with just enough structure to exercise your
`detectionSignals` (see the existing `sample-wdio-*-project` fixtures), and assert on
`matchesSkillDetection` / `resolveSkills` the way `test/unit/detector.test.ts` and
`test/unit/resolve-skills.test.ts` do. Auto-detection heuristics are inherently a best guess until
exercised against real repos — expect to tune signals after real usage, not just fixture tests.
