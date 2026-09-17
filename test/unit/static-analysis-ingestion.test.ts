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

function makeContext(repoRoot: string, changedFilePaths: string[]): PipelineContext {
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
});
