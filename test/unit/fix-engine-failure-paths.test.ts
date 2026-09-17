import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../../src/core/types/finding.js';
import type { ReviewResult } from '../../src/core/types/review-result.js';

const applyPatches = vi.fn();
const commitFixes = vi.fn();
const revertFiles = vi.fn();
vi.mock('../../src/fix/git-commit-engine.js', () => ({ applyPatches, commitFixes, revertFiles }));

const runSandboxChecks = vi.fn();
vi.mock('../../src/fix/sandbox-runner.js', () => ({ runSandboxChecks }));

vi.mock('../../src/fix/patch-validator.js', () => ({ validatePatch: vi.fn().mockResolvedValue({ valid: true, touchedFiles: ['src/foo.ts'] }) }));

const { FixEngine } = await import('../../src/fix/fix-engine.js');

const ASSERTION_PATCH = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export async function foo() {
   const r = await x();
+  expect(r.status).toBe(201);
   return r;
 }
`;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'HIGH',
    category: 'missing-validation',
    location: { file: 'src/foo.ts', startLine: 3 },
    title: 'Missing assertion',
    problem: 'p',
    rationale: 'r',
    suggestion: 'add assertion',
    confidence: 0.95,
    skillId: 'code-convention',
    autoFixable: true,
    status: 'validated',
    suggestedDiff: ASSERTION_PATCH,
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

describe('FixEngine — failure paths (mocked git/sandbox layer)', () => {
  beforeEach(() => {
    applyPatches.mockReset();
    commitFixes.mockReset();
    revertFiles.mockReset().mockResolvedValue(undefined);
    runSandboxChecks.mockReset();
  });

  it('skips and falls back to suggestions when applying the patch fails post-validation (e.g. a TOCTOU race)', async () => {
    applyPatches.mockResolvedValue({ applied: false, touchedFiles: [], reason: 'file changed on disk since validation' });

    const engine = new FixEngine();
    const result = await engine.run({
      reviewResult: makeResult([makeFinding()]),
      mode: 'fix',
      repoRoot: '/fake',
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ findingId: 'f1', reason: 'file changed on disk since validation' }]);
    expect(result.fallback).toBe('suggestions');
    expect(commitFixes).not.toHaveBeenCalled();
    expect(runSandboxChecks).not.toHaveBeenCalled();
  });

  it('reverts and skips when the post-apply sandbox checks fail, never committing', async () => {
    applyPatches.mockResolvedValue({ applied: true, touchedFiles: ['src/foo.ts'] });
    runSandboxChecks.mockResolvedValue({
      allPassed: false,
      checks: [{ tool: 'eslint', passed: false, summary: 'lint errors found' }, { tool: 'tsc', passed: true, summary: 'no type errors' }],
    });

    const engine = new FixEngine();
    const result = await engine.run({
      reviewResult: makeResult([makeFinding()]),
      mode: 'fix',
      repoRoot: '/fake',
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ findingId: 'f1', reason: 'reverted — sandbox validation failed (eslint)' }]);
    expect(result.fallback).toBe('suggestions');
    expect(revertFiles).toHaveBeenCalledWith('/fake', ['src/foo.ts']);
    expect(commitFixes).not.toHaveBeenCalled();
  });

  it('reverts and skips when the commit step itself fails after sandbox checks passed', async () => {
    applyPatches.mockResolvedValue({ applied: true, touchedFiles: ['src/foo.ts'] });
    runSandboxChecks.mockResolvedValue({ allPassed: true, checks: [] });
    commitFixes.mockResolvedValue({ committed: false, reason: 'git commit failed: nothing to commit' });

    const engine = new FixEngine();
    const result = await engine.run({
      reviewResult: makeResult([makeFinding()]),
      mode: 'fix',
      repoRoot: '/fake',
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ findingId: 'f1', reason: 'git commit failed: nothing to commit' }]);
    expect(result.fallback).toBe('suggestions');
    expect(revertFiles).toHaveBeenCalledWith('/fake', ['src/foo.ts']);
  });

  it('applies and commits successfully when every gate passes, with commit.pushed always false', async () => {
    applyPatches.mockResolvedValue({ applied: true, touchedFiles: ['src/foo.ts'] });
    runSandboxChecks.mockResolvedValue({ allPassed: true, checks: [{ tool: 'eslint', passed: true, summary: 'no lint errors' }] });
    commitFixes.mockResolvedValue({ committed: true, sha: 'a'.repeat(40) });

    const engine = new FixEngine();
    const result = await engine.run({
      reviewResult: makeResult([makeFinding()]),
      mode: 'fix',
      repoRoot: '/fake',
      allowedSafetyClasses: ['SAFE'],
    });

    expect(result.applied).toEqual([{ findingId: 'f1' }]);
    expect(result.commit).toEqual({ sha: 'a'.repeat(40), pushed: false });
    expect(revertFiles).not.toHaveBeenCalled();
  });

  it('batches multiple SAFE findings for the same file into one apply/commit call', async () => {
    applyPatches.mockResolvedValue({ applied: true, touchedFiles: ['src/foo.ts'] });
    runSandboxChecks.mockResolvedValue({ allPassed: true, checks: [] });
    commitFixes.mockResolvedValue({ committed: true, sha: 'b'.repeat(40) });

    const findings = [
      makeFinding({ id: 'f1' }),
      makeFinding({ id: 'f2', title: 'Another missing assertion', location: { file: 'src/foo.ts', startLine: 10 } }),
    ];

    const engine = new FixEngine();
    const result = await engine.run({
      reviewResult: makeResult(findings),
      mode: 'fix',
      repoRoot: '/fake',
      allowedSafetyClasses: ['SAFE'],
    });

    expect(applyPatches).toHaveBeenCalledTimes(1);
    expect(applyPatches.mock.calls[0][1]).toHaveLength(2);
    expect(result.applied).toEqual([{ findingId: 'f1' }, { findingId: 'f2' }]);
  });
});
