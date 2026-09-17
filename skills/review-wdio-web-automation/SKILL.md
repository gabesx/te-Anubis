---
id: review-wdio-web-automation
name: WebdriverIO Web Automation Review
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.page.ts"
    - "**/pageobjects/**/*.ts"
    - "**/step-definitions/**/*.ts"
    - "**/features/**/*.ts"
  frameworks:
    - wdio
    - webdriverio
detectionSignals:
  - type: file-glob
    value: "wdio.conf.*"
    required: true
  - type: package-dependency
    value: "@wdio/browser-runner"
  - type: file-glob
    value: "**/*.page.ts"
  - type: file-glob
    value: "**/pageobjects/**"
autoFixable: false
---

## What this skill reviews

Browser-based web automation via WebdriverIO. Focus is on selector
resilience, wait strategy, and whether the page-object layer actually
isolates tests from UI/DOM churn.

## Expected architecture

- Page objects encapsulate selectors and interactions per page/component;
  step definitions/tests call page-object methods, not raw selectors.
- Selectors prefer stable attributes (`data-testid`, `id`, semantic ARIA
  roles) over brittle ones (deep CSS descendant chains, nth-child indexing,
  matching on visible text expected to change with copy/i18n).
- Waits are explicit and condition-based (`waitForDisplayed`,
  `waitForClickable`, waiting on a network/state signal) rather than fixed
  `pause()` calls.
- Cross-browser/viewport concerns are handled through WDIO capabilities
  configuration, not duplicated test logic per browser.

## Conventions

- One page object per page/major component; no raw `$()`/`$$()` selector
  calls inside step definitions or spec files.
- Explicit wait before every interaction that depends on async UI state
  (navigation, animation, network-driven content).
- Test data/setup that affects page state is created through the
  application's API where possible, not through slow, flaky UI-driven setup
  steps.

## Anti-patterns

- **Fixed sleeps**: `browser.pause(2000)` instead of an explicit wait on the
  actual condition.
- **Brittle selectors**: deep CSS chains (`div > div:nth-child(3) > span`),
  index-based selectors, or selecting by visible text/copy.
- **Retry-as-a-fix**: wrapping a flaky click/assertion in a retry loop
  instead of fixing the underlying wait or selector.
- **Logic in step definitions** that belongs in a page object (raw selectors,
  multi-step interactions duplicated across scenarios).
- **UI-driven test setup** for state that could be created directly via API,
  making the suite slow and more prone to unrelated UI flakiness.

## Severity guidance

- **BLOCKER/HIGH**: brittle selectors or fixed sleeps on a core user flow
  that make the suite flaky by construction.
- **MEDIUM**: retry-as-a-fix masking a real timing bug; significant selector
  logic duplicated instead of centralized in a page object.
- **LOW**: minor selector-stability improvements.
- **SUGGESTION**: page-object organization/naming cleanup.

## Review checklist

- [ ] Are selectors based on stable attributes, not brittle CSS/text
      matching?
- [ ] Does every state-dependent interaction have an explicit wait, not a
      fixed sleep?
- [ ] Do step definitions call page-object methods rather than raw
      selectors?
- [ ] Could this test's setup be done via API instead of slower UI-driven
      steps?
- [ ] Are retries scoped to genuine flakiness, not used to hide a real bug?

## Examples

**Bad**:
```ts
await browser.pause(2000);
await $('div.container > div:nth-child(3) > span').click();
```

**Good**:
```ts
const checkoutButton = await CheckoutPage.submitOrderButton;
await checkoutButton.waitForClickable({ timeout: 5000 });
await checkoutButton.click();
```

## Auto-fix policy

Not auto-fixable at the skill level for MVP — selector/wait-strategy fixes
require knowledge of the actual page DOM that a mechanical patch can't
safely infer. Findings include a concrete suggested change for a human to
apply.
