import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSandboxChecks } from '../../src/fix/sandbox-runner.js';

describe('runSandboxChecks', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-sandbox-test-'));
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'foo.ts'), 'export const x = 1;\n');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('returns allPassed true with no checks when nothing is configured (no eslint, no tsconfig, no test script)', async () => {
    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);
    expect(result.allPassed).toBe(true);
    expect(result.checks).toEqual([]);
  });

  it('does not report a check as passed when it was never actually run', async () => {
    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);
    expect(result.checks.find((c) => c.tool === 'eslint')).toBeUndefined();
    expect(result.checks.find((c) => c.tool === 'tsc')).toBeUndefined();
    expect(result.checks.find((c) => c.tool === 'tests')).toBeUndefined();
  });

  it('does not attempt to run tests when package.json has no test script', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'echo build' } }));
    return runSandboxChecks(repoRoot, ['src/foo.ts']).then((result) => {
      expect(result.checks.find((c) => c.tool === 'tests')).toBeUndefined();
    });
  });
});
