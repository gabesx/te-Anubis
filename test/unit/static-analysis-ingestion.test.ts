import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { staticAnalysisIngestionStage } from '../../src/core/pipeline/stages/06-static-analysis-ingestion.js';
import type { PipelineContext } from '../../src/core/types/pipeline.js';

/** A stub eslint that just records the argv it was called with, so we can assert on the
 * exact flags/args without needing a real eslint install. */
function installArgvRecordingStub(repoRoot: string, argvLogPath: string): void {
  mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true });
  const stubPath = join(repoRoot, 'node_modules', '.bin', 'eslint');
  writeFileSync(
    stubPath,
    `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(argvLogPath)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('[]');\n`,
  );
  chmodSync(stubPath, 0o755);
}

function makeContext(repoRoot: string, changedFilePaths: string[], hasTypescriptConfig = false): PipelineContext {
  return {
    runId: 'run-1',
    repoRoot,
    config: {
      version: 1,
      ai: { provider: 'anthropic' },
      review: { minimumConfidence: 0.7, maxComments: 15, maxFiles: 50 },
      skills: { autoDetect: true, enabled: [] },
      github: { inlineComments: true, summary: true },
      fix: { enabled: false, autoCommit: false, allowed: ['SAFE'] },
    },
    target: { baseRef: 'base', headRef: 'head', commitSha: '' },
    repoManifest: { frameworks: [], raw: { hasTypescriptConfig } },
    changedFiles: changedFilePaths.map((path) => ({ path, changeType: 'modified', hunks: [], language: 'typescript', classification: 'source' })),
    skills: [],
    contextBundles: new Map(),
    lintIssues: [],
    validation: {},
    rawFindings: [],
    findings: [],
    filesSkipped: [],
    metrics: { llmRequests: 0, tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0, durationMs: 0, findingsGenerated: 0, findingsRejected: 0, findingsFinal: 0, stageDurations: {} },
  };
}

function installStubBin(repoRoot: string, name: string, script: string): void {
  mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true });
  const stubPath = join(repoRoot, 'node_modules', '.bin', name);
  writeFileSync(stubPath, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(stubPath, 0o755);
}

describe('staticAnalysisIngestionStage', () => {
  let repoRoot: string;
  let argvLogPath: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-static-analysis-test-'));
    argvLogPath = join(repoRoot, 'argv.json');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('invokes eslint with a `--` separator before the changed-file paths (argument-injection guard)', async () => {
    installArgvRecordingStub(repoRoot, argvLogPath);
    // A filename that would be read as a flag if passed without `--` first.
    const maliciousPath = '--rulesdir=whatever.js';
    const ctx = makeContext(repoRoot, [maliciousPath]);

    await staticAnalysisIngestionStage.run(ctx);

    const argv = JSON.parse(readFileSync(argvLogPath, 'utf-8')) as string[];
    const separatorIndex = argv.indexOf('--');
    expect(separatorIndex).toBeGreaterThanOrEqual(0);
    expect(argv.slice(separatorIndex + 1)).toContain(maliciousPath);
  });

  it('leaves validation.lint unset when eslint is not installed in the target repo', async () => {
    const ctx = makeContext(repoRoot, ['src/foo.ts']);
    const result = await staticAnalysisIngestionStage.run(ctx);
    expect(result.validation.lint).toBeUndefined();
  });

  it('reports lint passed with no changed lintable files when no changed file is typescript/javascript', async () => {
    installStubBin(repoRoot, 'eslint', `console.log('[]');`);
    const ctx = makeContext(repoRoot, []);
    ctx.changedFiles = [{ path: 'README.md', changeType: 'modified', hunks: [], language: 'markdown', classification: 'docs' }];

    const result = await staticAnalysisIngestionStage.run(ctx);

    expect(result.validation.lint).toEqual({ tool: 'eslint', passed: true, summary: 'no lintable files changed' });
  });

  it('parses real eslint JSON output into lintIssues and reports failure when errors are present', async () => {
    const eslintOutput = JSON.stringify([
      {
        filePath: join(repoRoot, 'src/foo.ts'),
        messages: [
          { ruleId: 'no-unused-vars', message: "'x' is defined but never used.", line: 5, severity: 2 },
          { ruleId: 'no-console', message: 'Unexpected console statement.', line: 8, severity: 1 },
        ],
      },
    ]);
    installStubBin(repoRoot, 'eslint', `console.log(${JSON.stringify(eslintOutput)});`);
    const ctx = makeContext(repoRoot, ['src/foo.ts']);

    const result = await staticAnalysisIngestionStage.run(ctx);

    expect(result.validation.lint).toEqual({ tool: 'eslint', passed: false, summary: '1 lint error(s)' });
    expect(result.lintIssues).toEqual([
      { file: 'src/foo.ts', line: 5, ruleId: 'no-unused-vars', message: "'x' is defined but never used." },
      { file: 'src/foo.ts', line: 8, ruleId: 'no-console', message: 'Unexpected console statement.' },
    ]);
  });

  it('reports lint passed when eslint runs with zero error-severity messages', async () => {
    const eslintOutput = JSON.stringify([
      { filePath: join(repoRoot, 'src/foo.ts'), messages: [{ ruleId: 'no-console', message: 'warn only', line: 1, severity: 1 }] },
    ]);
    installStubBin(repoRoot, 'eslint', `console.log(${JSON.stringify(eslintOutput)});`);
    const ctx = makeContext(repoRoot, ['src/foo.ts']);

    const result = await staticAnalysisIngestionStage.run(ctx);

    expect(result.validation.lint).toEqual({ tool: 'eslint', passed: true, summary: 'no lint errors' });
  });

  it('handles unparseable eslint output gracefully instead of throwing', async () => {
    installStubBin(repoRoot, 'eslint', `console.log('not valid json output');`);
    const ctx = makeContext(repoRoot, ['src/foo.ts']);

    const result = await staticAnalysisIngestionStage.run(ctx);

    expect(result.validation.lint?.summary).toMatch(/could not be parsed/);
    expect(result.lintIssues).toEqual([]);
  });

  it('leaves validation.typecheck unset when the repo has no tsconfig.json', async () => {
    installStubBin(repoRoot, 'tsc', `process.exit(0);`);
    const ctx = makeContext(repoRoot, ['src/foo.ts'], false);
    const result = await staticAnalysisIngestionStage.run(ctx);
    expect(result.validation.typecheck).toBeUndefined();
  });

  it('runs tsc and reports pass/fail when a tsconfig.json is present and tsc is installed', async () => {
    writeFileSync(join(repoRoot, 'tsconfig.json'), '{}');
    installStubBin(repoRoot, 'tsc', `process.exit(1);`);
    const ctx = makeContext(repoRoot, ['src/foo.ts'], true);

    const result = await staticAnalysisIngestionStage.run(ctx);

    expect(result.validation.typecheck).toEqual({ tool: 'tsc', passed: false, summary: 'type errors found' });
  });
});
