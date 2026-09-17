import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixEngine } from '../../src/fix/fix-engine.js';
import type { Finding } from '../../src/core/types/finding.js';
import type { ReviewResult } from '../../src/core/types/review-result.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'HIGH',
    category: 'missing-validation',
    location: { file: 'src/foo.ts', startLine: 3 },
    title: 'Missing status assertion',
    problem: 'p',
    rationale: 'r',
    suggestion: 'add an assertion',
    confidence: 0.95,
    skillId: 'code-convention',
    autoFixable: true,
    status: 'validated',
    ...overrides,
  };
}

function makeResult(findings: Finding[]): ReviewResult {
  return {
    runId: 'run-1',
    repo: { root: '/repo' },
    target: { baseRef: 'base', headRef: 'head', commitSha: 'sha' },
    provider: { name: 'anthropic', model: 'claude-sonnet-4-5' },
    skillsUsed: ['code-convention'],
    findings,
    summary: { countsBySeverity: { BLOCKER: 0, HIGH: findings.length, MEDIUM: 0, LOW: 0, SUGGESTION: 0 }, filesAnalyzed: 1, filesSkipped: 0 },
    validation: {},
    metrics: { llmRequests: 0, tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0, durationMs: 0, findingsGenerated: 0, findingsRejected: 0, findingsFinal: 0, stageDurations: {} },
    generatedAt: new Date().toISOString(),
  };
}

const ASSERTION_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export async function createOrder(client) {
   const response = await client.post('/orders');
+  expect(response.status).toBe(201);
   return response;
 }
`;

const BEHAVIORAL_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,5 @@
 export async function createOrder(client) {
-  const response = await client.post('/orders');
+  if (!client) throw new Error('no client');
+  const response = await client.post('/orders');
   return response;
 }
`;

describe('FixEngine', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-fix-engine-test-'));
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'src', 'foo.ts'),
      "export async function createOrder(client) {\n  const response = await client.post('/orders');\n  return response;\n}\n",
    );

    const git = simpleGit(repoRoot);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Anubis Test');
    await git.add('.');
    await git.commit('initial');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('applies and commits a SAFE fix in fix mode', async () => {
    const finding = makeFinding({ suggestedDiff: ASSERTION_PATCH });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([{ findingId: 'f1' }]);
    expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commit?.pushed).toBe(false);
    expect(readFileSync(join(repoRoot, 'src', 'foo.ts'), 'utf-8')).toContain('expect(response.status).toBe(201)');
  });

  it('never applies anything in suggest mode, even for a SAFE-shaped patch', async () => {
    const finding = makeFinding({ suggestedDiff: ASSERTION_PATCH });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'suggest',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.suggested).toEqual([{ findingId: 'f1', diff: ASSERTION_PATCH }]);
    expect(readFileSync(join(repoRoot, 'src', 'foo.ts'), 'utf-8')).not.toContain('expect(');
  });

  it('routes a REVIEW_REQUIRED (behavioral) fix to suggested, never auto-committing it', async () => {
    const finding = makeFinding({ suggestedDiff: BEHAVIORAL_PATCH });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.suggested).toEqual([{ findingId: 'f1', diff: BEHAVIORAL_PATCH }]);
    expect(finding.safetyClass).toBe('REVIEW_REQUIRED');
    expect(readFileSync(join(repoRoot, 'src', 'foo.ts'), 'utf-8')).not.toContain('no client');
  });

  it('never auto-fixes a finding whose patch touches a denylisted path, regardless of mode', async () => {
    const finding = makeFinding({
      location: { file: '.env', startLine: 1 },
      suggestedDiff: '--- a/.env\n+++ b/.env\n@@ -1,1 +1,1 @@\n-A=1\n+A=2\n',
    });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/UNSAFE/);
  });

  it('skips a finding with no suggestedDiff entirely (nothing to act on)', async () => {
    const finding = makeFinding({ suggestedDiff: undefined });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.suggested).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('does not auto-commit a SAFE fix when SAFE is not in allowedSafetyClasses', async () => {
    const finding = makeFinding({ suggestedDiff: ASSERTION_PATCH });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: [], // fix.allowed configured empty — nothing is eligible
    });

    expect(result.applied).toEqual([]);
    expect(result.suggested).toEqual([{ findingId: 'f1', diff: ASSERTION_PATCH }]);
  });

  it('reverts and skips when a SAFE patch fails to apply cleanly (file changed since the finding was generated)', async () => {
    // Simulate drift: the file on disk no longer matches what the patch expects.
    writeFileSync(join(repoRoot, 'src', 'foo.ts'), 'export async function createOrder(client) {\n  return null;\n}\n');

    const finding = makeFinding({ suggestedDiff: ASSERTION_PATCH });
    const engine = new FixEngine();

    const result = await engine.run({
      reviewResult: makeResult([finding]),
      mode: 'fix',
      repoRoot,
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/validation/);
  });
});
