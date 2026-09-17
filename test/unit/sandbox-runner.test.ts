import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('invokes eslint with a `--` separator before touched-file paths (argument-injection guard)', async () => {
    const argvLogPath = join(repoRoot, 'argv.json');
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true });
    const stubPath = join(repoRoot, 'node_modules', '.bin', 'eslint');
    writeFileSync(
      stubPath,
      `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(argvLogPath)}, JSON.stringify(process.argv.slice(2)));\n`,
    );
    chmodSync(stubPath, 0o755);

    const maliciousPath = '--rulesdir=whatever.js';
    await runSandboxChecks(repoRoot, [maliciousPath]);

    const argv = JSON.parse(readFileSync(argvLogPath, 'utf-8')) as string[];
    const separatorIndex = argv.indexOf('--');
    expect(separatorIndex).toBeGreaterThanOrEqual(0);
    expect(argv.slice(separatorIndex + 1)).toContain(maliciousPath);
  });

  function installStubBin(name: string, script: string): void {
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true });
    const stubPath = join(repoRoot, 'node_modules', '.bin', name);
    writeFileSync(stubPath, `#!/usr/bin/env node\n${script}\n`);
    chmodSync(stubPath, 0o755);
  }

  it('skips the typecheck when tsc is not installed even if tsconfig.json is present', async () => {
    writeFileSync(join(repoRoot, 'tsconfig.json'), '{}');
    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);
    expect(result.checks.find((c) => c.tool === 'tsc')).toBeUndefined();
  });

  it('runs tsc and reports the pass/fail result when both tsconfig.json and tsc are present', async () => {
    writeFileSync(join(repoRoot, 'tsconfig.json'), '{}');
    installStubBin('tsc', 'process.exit(1);');

    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);

    expect(result.checks.find((c) => c.tool === 'tsc')).toEqual({ tool: 'tsc', passed: false, summary: 'type errors found' });
    expect(result.allPassed).toBe(false);
  });

  it('runs the configured test script and reports pass when it exits 0', async () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(0)"' } }));

    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);

    expect(result.checks).toEqual([{ tool: 'tests', passed: true, summary: 'tests passed' }]);
    expect(result.allPassed).toBe(true);
  });

  it('runs the configured test script and reports failure (and allPassed: false) when it exits non-zero', async () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(1)"' } }));

    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);

    expect(result.checks).toEqual([{ tool: 'tests', passed: false, summary: 'tests failed' }]);
    expect(result.allPassed).toBe(false);
  });

  it('treats malformed package.json as "no test script" rather than throwing', async () => {
    writeFileSync(join(repoRoot, 'package.json'), 'not valid json {{{');
    const result = await runSandboxChecks(repoRoot, ['src/foo.ts']);
    expect(result.checks.find((c) => c.tool === 'tests')).toBeUndefined();
  });
});
