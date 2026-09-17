---
id: code-convention
name: Code Convention Review
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.js"
    - "**/*.jsx"
autoFixable: true
---

## What this skill reviews

General TypeScript/JavaScript code conventions and maintainability — the
things a careful reviewer flags regardless of what kind of project this is.
This skill has no detection signals: it is included whenever
`skills.enabled` lists it (the config schema enables it by default), not via
auto-detection, since it applies to essentially any TS/JS repo.

This skill exists to catch real conventions issues the change introduces or
exposes — not to restate what the project's own linter/formatter already
enforces. If ESLint/Prettier already flags something, this skill should stay
silent about it (see Finding Validator: findings that just restate an
existing lint error are rejected).

## Expected architecture

- Naming, module boundaries, and error handling follow the patterns already
  established elsewhere in the same repository — consistency with existing
  code takes priority over any single "best practice."
- Public/exported functions have meaningful names and a signature that
  reflects what they actually do.
- Error handling matches what the surrounding code does (thrown typed
  errors vs. result objects vs. callbacks) — don't introduce a second style
  in a codebase that already picked one.

## Conventions

- Match existing naming/casing conventions in the surrounding module.
- Don't duplicate logic that already exists as a shared utility elsewhere in
  the repo — reuse it.
- Keep error handling consistent with the pattern already used in
  neighboring code in the same module/package.
- New exported symbols get names that match the vocabulary already used in
  the codebase, not a competing naming scheme.

## Anti-patterns

- **Reinventing an existing utility** instead of importing the one already
  in the codebase.
- **Silently swallowed errors** (empty `catch` blocks, ignored promise
  rejections) introduced by the change.
- **Inconsistent error-handling style** introduced in a module that already
  has an established pattern.
- **Dead code** introduced by the change (unused exports, unreachable
  branches) — not pre-existing dead code the PR doesn't touch.

## Severity guidance

- **HIGH**: a silently swallowed error or ignored rejection introduced by
  this change, in a path that can hide a real failure.
- **MEDIUM**: a new, real duplicate of an existing shared utility;
  inconsistent error handling introduced in an otherwise-consistent module.
- **LOW**: naming that diverges from the surrounding module's conventions.
- **SUGGESTION**: minor organizational cleanup.

## Review checklist

- [ ] Does this introduce a duplicate of logic that already exists
      elsewhere in the repo?
- [ ] Are any errors/rejections introduced by this change silently
      swallowed?
- [ ] Does error handling here match the pattern already used in this
      module?
- [ ] Do new names match the vocabulary already used in this codebase?
- [ ] Is there dead code (unused export, unreachable branch) introduced by
      this change?

## Examples

**Bad** — swallowed error introduced by the change:
```ts
try {
  await saveOrder(order);
} catch {
  // nothing — failure is now invisible
}
```

**Good**:
```ts
try {
  await saveOrder(order);
} catch (err) {
  logger.error('failed to save order', { orderId: order.id, err });
  throw err;
}
```

## Auto-fix policy

Auto-fixable at the skill level: this is the category the Fix Engine's
SAFE-classification is built around (formatting, deterministic typos, unused
imports, a missing simple assertion). Individual findings still go through
the Fix Engine's rule-based safety classifier — this flag is a bias toward
"this kind of fix is often mechanical," not a guarantee every finding from
this skill is auto-committed without review.
