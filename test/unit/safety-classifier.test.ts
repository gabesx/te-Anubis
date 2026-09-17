import { describe, expect, it } from 'vitest';
import { classifyFixSafety } from '../../src/fix/safety-classifier.js';
import type { Finding } from '../../src/core/types/finding.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'id',
    severity: 'HIGH',
    category: 'bug',
    location: { file: 'src/foo.ts', startLine: 5 },
    title: 't',
    problem: 'p',
    rationale: 'r',
    suggestion: 's',
    confidence: 0.95,
    skillId: 'code-convention',
    autoFixable: true,
    status: 'validated',
    ...overrides,
  };
}

const UNUSED_IMPORT_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,3 @@
-import { unused } from './unused.js';
 import { used } from './used.js';

 export function foo() {}
`;

const WHITESPACE_ONLY_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 export function foo() {
-    return 1;
+  return 1;
 }
`;

const ASSERTION_ADDITION_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const response = await client.post('/orders');
+expect(response.status).toBe(201);
 return response;
`;

const BEHAVIORAL_CHANGE_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,5 @@
 export function foo(x) {
-  return x;
+  if (x > 0) {
+    return x * 2;
+  }
 }
`;

const MULTI_FILE_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,1 @@
-a
+b
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,1 +1,1 @@
-c
+d
`;

describe('classifyFixSafety', () => {
  it('classifies an unused-import-removal-only patch as SAFE', () => {
    const result = classifyFixSafety(makeFinding(), UNUSED_IMPORT_PATCH);
    expect(result.class).toBe('SAFE');
  });

  it('classifies a whitespace-only patch as SAFE', () => {
    const result = classifyFixSafety(makeFinding(), WHITESPACE_ONLY_PATCH);
    expect(result.class).toBe('SAFE');
  });

  it('classifies an assertion-addition-only patch as SAFE', () => {
    const result = classifyFixSafety(makeFinding(), ASSERTION_ADDITION_PATCH);
    expect(result.class).toBe('SAFE');
  });

  it('classifies a behavioral (control-flow) change as REVIEW_REQUIRED (fail-closed default)', () => {
    const result = classifyFixSafety(makeFinding(), BEHAVIORAL_CHANGE_PATCH);
    expect(result.class).toBe('REVIEW_REQUIRED');
  });

  it('classifies a multi-file patch as REVIEW_REQUIRED regardless of shape', () => {
    const result = classifyFixSafety(makeFinding(), MULTI_FILE_PATCH);
    expect(result.class).toBe('REVIEW_REQUIRED');
  });

  it('forces UNSAFE for a finding located in a denylisted path, even with a SAFE-shaped patch', () => {
    const finding = makeFinding({ location: { file: '.env.production', startLine: 1 } });
    const result = classifyFixSafety(finding, WHITESPACE_ONLY_PATCH.replace(/foo\.ts/g, '.env.production'));
    expect(result.class).toBe('UNSAFE');
  });

  it('forces UNSAFE for an auth-related file path', () => {
    const finding = makeFinding({ location: { file: 'src/auth/session.ts', startLine: 1 } });
    const result = classifyFixSafety(finding, ASSERTION_ADDITION_PATCH.replace(/foo\.ts/g, 'auth/session.ts'));
    expect(result.class).toBe('UNSAFE');
  });

  it('forces UNSAFE for a GitHub workflow file', () => {
    const finding = makeFinding({ location: { file: '.github/workflows/deploy.yml', startLine: 1 } });
    const result = classifyFixSafety(finding, WHITESPACE_ONLY_PATCH.replace(/foo\.ts/g, '.github/workflows/deploy.yml'));
    expect(result.class).toBe('UNSAFE');
  });

  it('downgrades an otherwise-SAFE-shaped patch to REVIEW_REQUIRED when confidence is below the auto-commit bar', () => {
    const finding = makeFinding({ confidence: 0.6 });
    const result = classifyFixSafety(finding, ASSERTION_ADDITION_PATCH);
    expect(result.class).toBe('REVIEW_REQUIRED');
    expect(result.reasons.join(' ')).toMatch(/confidence/);
  });

  it('downgrades a SAFE-shaped patch that exceeds the changed-line cap to REVIEW_REQUIRED', () => {
    const manyImports = Array.from({ length: 40 }, (_, i) => `-import { x${i} } from './x${i}.js';`).join('\n');
    const bigPatch = `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,40 +1,0 @@\n${manyImports}\n`;
    const result = classifyFixSafety(makeFinding(), bigPatch);
    expect(result.class).toBe('REVIEW_REQUIRED');
  });

  it('never returns SAFE for a patch that could not be parsed', () => {
    const result = classifyFixSafety(makeFinding(), 'not a real diff at all');
    expect(result.class).not.toBe('SAFE');
  });
});
