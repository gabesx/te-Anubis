import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../utils/exec.js';
import type { ToolCheckResult } from '../core/types/review-result.js';

async function runEslintCheck(repoRoot: string, touchedFiles: string[]): Promise<ToolCheckResult | undefined> {
  const eslintBin = join(repoRoot, 'node_modules', '.bin', 'eslint');
  if (!existsSync(eslintBin)) return undefined;
  const result = await run(eslintBin, touchedFiles, { cwd: repoRoot, timeoutMs: 60_000 });
  return { tool: 'eslint', passed: result.exitCode === 0, summary: result.exitCode === 0 ? 'no lint errors' : 'lint errors found' };
}

async function runTypecheckCheck(repoRoot: string): Promise<ToolCheckResult | undefined> {
  const tscBin = join(repoRoot, 'node_modules', '.bin', 'tsc');
  if (!existsSync(join(repoRoot, 'tsconfig.json')) || !existsSync(tscBin)) return undefined;
  const result = await run(tscBin, ['--noEmit'], { cwd: repoRoot, timeoutMs: 120_000 });
  return { tool: 'tsc', passed: result.exitCode === 0, summary: result.exitCode === 0 ? 'no type errors' : 'type errors found' };
}

function hasTestScript(repoRoot: string): boolean {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.test);
  } catch {
    return false;
  }
}

async function runTestsCheck(repoRoot: string): Promise<ToolCheckResult | undefined> {
  if (!hasTestScript(repoRoot)) return undefined;
  const result = await run('npm', ['test', '--silent'], { cwd: repoRoot, timeoutMs: 300_000 });
  return { tool: 'tests', passed: result.exitCode === 0, summary: result.exitCode === 0 ? 'tests passed' : 'tests failed' };
}

export interface SandboxRunResult {
  allPassed: boolean;
  checks: ToolCheckResult[];
}

/**
 * Runs the target repo's own configured lint/typecheck/tests against the
 * working tree after a patch has been applied but before it's committed.
 * Never edits config or test files to make a failing check pass, never
 * skips a check that IS configured — a check that simply isn't configured
 * (no eslint installed, no tsconfig, no test script) is absent from the
 * result, not silently marked passed.
 */
export async function runSandboxChecks(repoRoot: string, touchedFiles: string[]): Promise<SandboxRunResult> {
  const checks = (
    await Promise.all([runEslintCheck(repoRoot, touchedFiles), runTypecheckCheck(repoRoot), runTestsCheck(repoRoot)])
  ).filter((c): c is ToolCheckResult => c !== undefined);
  return { allPassed: checks.every((c) => c.passed), checks };
}
