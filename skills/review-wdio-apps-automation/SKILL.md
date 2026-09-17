---
id: review-wdio-apps-automation
name: WebdriverIO Mobile (Appium) Automation Review
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.mobile.*.ts"
    - "**/*.appium.*.ts"
    - "**/step-definitions/**/*.ts"
    - "**/features/**/*.ts"
  frameworks:
    - wdio
    - appium
detectionSignals:
  - type: file-glob
    value: "wdio.conf.*"
    required: true
  - type: package-dependency
    value: "@wdio/appium-service"
    required: true
  - type: package-dependency
    value: appium
  - type: config-key
    value: "wdio.conf.ts:appium"
autoFixable: false
---

## What this skill reviews

Mobile automation via WebdriverIO + Appium (native/hybrid iOS/Android apps).
Focus is on selector stability, wait strategy, and whether the test
architecture accounts for real device/emulator variability instead of
fighting it with sleeps and retries.

## Expected architecture

- Screens are modeled as page/screen objects with named selectors, not raw
  accessibility-id/xpath strings inlined in step definitions.
- Selectors prefer stable identifiers (`accessibility id`, resource-id) over
  fragile ones (absolute xpath, index-based selectors, visible text that a
  translator/designer can change).
- Waits are explicit and condition-based (`waitForDisplayed`,
  `waitForEnabled`) with a sensible timeout, not fixed `pause()`/`sleep()`
  calls.
- Platform differences (iOS vs Android selector syntax, gestures) are
  isolated behind a shared abstraction, not duplicated per spec file.

## Conventions

- One page/screen object per screen; step definitions call its methods, they
  don't reach into raw WebdriverIO selectors directly.
- Explicit wait conditions on every interaction that depends on app state
  (navigation, network response, animation).
- Device/session setup (capabilities, app reset behavior) lives in the WDIO
  config or a shared helper, not duplicated per test file.

## Anti-patterns

- **Fixed sleeps**: `browser.pause(3000)` used to "wait for the app," instead
  of an explicit wait on the actual condition (element displayed, network
  idle).
- **Fragile selectors**: absolute xpath (`//*[3]/*[2]/*[1]`), index-based
  selectors, or matching on visible copy text that's expected to change.
- **Retry-as-a-fix**: wrapping a flaky interaction in a blind retry loop
  instead of fixing the underlying wait/selector issue.
- **Platform-specific logic duplicated** across iOS/Android spec files
  instead of isolated behind one abstraction.
- **No app-state reset between tests**, causing cross-test contamination
  (leftover login sessions, cached data).

## Severity guidance

- **BLOCKER/HIGH**: fragile absolute-xpath/index selectors on core flows;
  fixed sleeps standing in for the only wait in a critical path, making the
  suite flaky by construction.
- **MEDIUM**: retry-as-a-fix masking a real timing bug; missing app-state
  reset between tests.
- **LOW**: minor selector-stability improvements, small duplication between
  platform variants.
- **SUGGESTION**: page-object organization cleanup.

## Review checklist

- [ ] Are selectors stable identifiers, not absolute xpath or index-based?
- [ ] Does every state-dependent interaction have an explicit wait condition,
      not a fixed sleep?
- [ ] Is platform-specific (iOS/Android) logic isolated behind one
      abstraction?
- [ ] Is app/session state reset between tests in a way that doesn't leak
      into the next scenario?
- [ ] Are retries scoped to genuine device/emulator flakiness, not used to
      hide a real bug?

## Examples

**Bad**:
```ts
await browser.pause(3000);
await $('//*[@class="android.widget.Button"][3]').click();
```

**Good**:
```ts
const loginButton = await LoginScreen.submitButton;
await loginButton.waitForDisplayed({ timeout: 5000 });
await loginButton.click();
```

## Auto-fix policy

Not auto-fixable at the skill level for MVP — selector and wait-strategy
fixes require knowledge of the actual app UI tree that a mechanical patch
can't safely infer. Findings include a concrete suggested change for a human
to apply.
