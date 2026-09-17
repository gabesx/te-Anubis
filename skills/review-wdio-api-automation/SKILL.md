---
id: review-wdio-api-automation
name: WebdriverIO API Automation Review
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.api.*.ts"
    - "**/step-definitions/**/*.ts"
    - "**/features/**/*.ts"
    - "**/*.steps.ts"
  frameworks:
    - wdio
    - webdriverio
detectionSignals:
  - type: file-glob
    value: "wdio.conf.*"
    required: true
  - type: package-dependency
    value: axios
  - type: package-dependency
    value: supertest
  - type: package-dependency
    value: got
autoFixable: false
---

## What this skill reviews

API test automation built on WebdriverIO (typically WDIO + Cucumber/Mocha
step definitions driving HTTP requests via axios/supertest/got, not a
browser). Focus is on whether the tests actually validate backend behavior,
not just whether they "run green."

## Expected architecture

- Step definitions call a thin API client layer (request builders / service
  objects), not raw `axios`/`fetch` calls scattered through step files.
- Request/response schemas are validated explicitly (status code + body
  shape), not inferred from the absence of a thrown error.
- Test data (auth tokens, fixtures, seeded records) is created and torn down
  per-scenario or per-suite in a way that does not depend on scenario
  execution order.
- Retries, if present, are scoped to genuinely flaky infrastructure (network
  blips), not used to paper over a race condition or a slow backend.

## Conventions

- Every API call under test has at least one explicit status-code assertion.
- Response body assertions check the fields the scenario is actually about,
  not just "response is not null."
- Shared setup (auth, base URL, headers) lives in one place per suite, not
  copy-pasted into each step file.
- Sensitive values (tokens, credentials) come from environment/config, never
  hardcoded in a step file or fixture committed to the repo.

## Anti-patterns

- **Silent-pass tests**: the request executes but neither the status code nor
  the response body is asserted — the scenario reports success regardless of
  what the backend returned.
- **Shared mutable test state**: one scenario's side effect (e.g. a created
  resource, a logged-in session) is relied upon by a later scenario, creating
  execution-order dependency.
- **Retry-as-a-fix**: a flaky assertion is wrapped in a retry/backoff loop
  instead of fixing the race condition or timing issue underneath it.
- **Weak assertions**: asserting `response.status !== 500` instead of the
  actual expected status; asserting a field merely "exists" instead of its
  expected value.
- **Copy-pasted request boilerplate** instead of a shared API client.

## Severity guidance

- **BLOCKER/HIGH**: a test can pass while the underlying backend behavior it
  claims to verify is actually broken (missing status/body assertion on the
  scenario's core behavior).
- **MEDIUM**: test-order dependency via shared state; retry used to mask
  flakiness rather than fix it.
- **LOW**: weak-but-present assertions, missing edge-case coverage.
- **SUGGESTION**: request-boilerplate duplication, minor client-layer
  cleanup.

## Review checklist

- [ ] Does every request under test assert the expected status code?
- [ ] Does the response-body assertion check the fields the scenario is
      actually about?
- [ ] Can this scenario run in isolation, in any order, without depending on
      another scenario's side effects?
- [ ] Is test data created and cleaned up by the test itself?
- [ ] Are retries scoped to genuine infra flakiness, not backend correctness?
- [ ] Are credentials/tokens sourced from config/env, not hardcoded?

## Examples

**Bad** — silent-pass:
```ts
await apiClient.post('/orders', payload);
// no assertion on the response at all
```

**Good**:
```ts
const response = await apiClient.post('/orders', payload);
expect(response.status).toBe(201);
expect(response.body.orderId).toBeDefined();
```

## Auto-fix policy

Not auto-fixable at the skill level for MVP — the fixes this skill's findings
usually call for (adding an assertion with the *correct* expected value,
restructuring shared state) require judgment about intended behavior that a
mechanical patch can't safely infer. Individual findings may still be
described with a concrete suggested diff for a human (or a later, more
capable Fix Engine phase) to apply.
