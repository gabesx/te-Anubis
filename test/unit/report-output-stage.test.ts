import { describe, expect, it } from 'vitest';
import { reportOutputStage } from '../../src/core/pipeline/stages/11-report-output.js';
import type { Finding, Severity } from '../../src/core/types/finding.js';
import type { PipelineContext } from '../../src/core/types/pipeline.js';

function makeFinding(id: string, severity: Severity, confidence: number): Finding {
  return {
    id,
    severity,
    category: 'bug',
    location: { file: 'src/foo.ts', startLine: 1 },
    title: id,
    problem: 'p',
    rationale: 'r',
    suggestion: 's',
    confidence,
    skillId: 'code-convention',
    autoFixable: false,
    status: 'validated',
  };
}

function makeContext(findings: Finding[], maxComments: number): PipelineContext {
  return {
    runId: 'run-1',
    repoRoot: '/fake',
    config: {
      version: 1,
      ai: { provider: 'anthropic' },
      review: { minimumConfidence: 0.7, maxComments, maxFiles: 50 },
      skills: { autoDetect: true, enabled: [] },
      github: { inlineComments: true, summary: true },
      fix: { enabled: false, autoCommit: false, allowed: ['SAFE'] },
    },
    target: { baseRef: 'base', headRef: 'head', commitSha: '' },
    changedFiles: [],
    skills: [],
    contextBundles: new Map(),
    lintIssues: [],
    validation: {},
    rawFindings: [],
    findings,
    filesSkipped: [],
    metrics: { llmRequests: 0, tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0, durationMs: 0, findingsGenerated: 0, findingsRejected: 0, findingsFinal: 0, stageDurations: {} },
  };
}

describe('reportOutputStage', () => {
  it('sorts findings by severity, most severe first', async () => {
    const findings = [makeFinding('low', 'LOW', 0.9), makeFinding('blocker', 'BLOCKER', 0.9), makeFinding('medium', 'MEDIUM', 0.9)];
    const ctx = makeContext(findings, 15);

    const result = await reportOutputStage.run(ctx);

    expect(result.findings.map((f) => f.id)).toEqual(['blocker', 'medium', 'low']);
  });

  it('breaks a severity tie by higher confidence first', async () => {
    const findings = [makeFinding('low-conf', 'HIGH', 0.6), makeFinding('high-conf', 'HIGH', 0.95)];
    const ctx = makeContext(findings, 15);

    const result = await reportOutputStage.run(ctx);

    expect(result.findings.map((f) => f.id)).toEqual(['high-conf', 'low-conf']);
  });

  it('enforces review.max_comments, keeping the highest-severity/confidence findings and dropping the rest', async () => {
    const findings = [
      makeFinding('blocker', 'BLOCKER', 0.9),
      makeFinding('high', 'HIGH', 0.9),
      makeFinding('medium', 'MEDIUM', 0.9),
      makeFinding('low', 'LOW', 0.9),
      makeFinding('suggestion', 'SUGGESTION', 0.9),
    ];
    const ctx = makeContext(findings, 2);

    const result = await reportOutputStage.run(ctx);

    expect(result.findings.map((f) => f.id)).toEqual(['blocker', 'high']);
  });

  it('leaves an empty findings list unchanged', async () => {
    const ctx = makeContext([], 15);
    const result = await reportOutputStage.run(ctx);
    expect(result.findings).toEqual([]);
  });

  it('does not mutate the original findings array reference (sorts a copy)', async () => {
    const findings = [makeFinding('a', 'LOW', 0.9), makeFinding('b', 'BLOCKER', 0.9)];
    const originalOrder = [...findings];
    const ctx = makeContext(findings, 15);

    await reportOutputStage.run(ctx);

    expect(findings).toEqual(originalOrder);
  });
});
