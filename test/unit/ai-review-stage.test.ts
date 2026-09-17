import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../src/core/providers/provider.js';
import type { ChangedFile, ContextBundle } from '../../src/core/types/context.js';
import type { PipelineContext } from '../../src/core/types/pipeline.js';

const complete = vi.fn();
const estimateCost = vi.fn(() => 0.001);

const fakeProvider: AIProvider = {
  name: 'anthropic',
  complete,
  estimateCost,
};

vi.mock('../../src/core/providers/provider-factory.js', () => ({
  createProvider: vi.fn(() => fakeProvider),
}));

const { aiReviewStage } = await import('../../src/core/pipeline/stages/07-ai-review.js');
const { createProvider } = await import('../../src/core/providers/provider-factory.js');

function makeChangedFile(path: string): ChangedFile {
  return { path, changeType: 'modified', hunks: [{ startLine: 1, endLine: 5, content: 'diff content' }], language: 'typescript', classification: 'source' };
}

function makeBundle(changedFile: ChangedFile): ContextBundle {
  return {
    changedFile,
    relatedFiles: [],
    repoManifest: { frameworks: [], raw: {} },
    tokenBudget: 1000,
    tokensUsed: 10,
  };
}

function makeContext(changedFiles: ChangedFile[], skillIds: string[]): PipelineContext {
  const contextBundles = new Map(changedFiles.map((f) => [f.path, makeBundle(f)]));
  return {
    runId: 'run-1',
    repoRoot: '/fake',
    config: {
      version: 1,
      ai: { provider: 'anthropic' },
      review: { minimumConfidence: 0.7, maxComments: 15, maxFiles: 50 },
      skills: { autoDetect: true, enabled: [] },
      github: { inlineComments: true, summary: true },
      fix: { enabled: false, autoCommit: false, allowed: ['SAFE'] },
    },
    target: { baseRef: 'HEAD~1', headRef: 'HEAD', commitSha: 'abc' },
    changedFiles,
    skills: skillIds.map((id) => ({
      frontmatter: { id, name: id, version: '1.0', appliesTo: { filePatterns: ['**/*.ts'] }, autoFixable: false },
      content: 'skill body',
      path: `/fake/skills/${id}/SKILL.md`,
      matchedFiles: changedFiles.map((f) => f.path),
      triggeredBy: 'manual',
    })),
    contextBundles,
    lintIssues: [],
    validation: {},
    rawFindings: [],
    findings: [],
    filesSkipped: [],
    metrics: {
      llmRequests: 0,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      findingsGenerated: 0,
      findingsRejected: 0,
      findingsFinal: 0,
      stageDurations: {},
    },
  };
}

describe('aiReviewStage', () => {
  it('skips creating a provider entirely when no changed file matches any skill', async () => {
    vi.mocked(createProvider).mockClear();
    const ctx = makeContext([], []);
    const result = await aiReviewStage.run(ctx);
    expect(result.rawFindings).toEqual([]);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('calls the provider once per matched changed file and accumulates metrics', async () => {
    complete.mockReset();
    complete.mockResolvedValue({
      text: JSON.stringify({
        findings: [
          {
            severity: 'HIGH',
            category: 'bug',
            title: 'Found something',
            problem: 'p',
            rationale: 'r',
            suggestion: 's',
            confidence: 0.9,
            line: 2,
            skillId: 'code-convention',
          },
        ],
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'claude-sonnet-4-5',
    });

    const changedFiles = [makeChangedFile('src/a.ts'), makeChangedFile('src/b.ts')];
    const ctx = makeContext(changedFiles, ['code-convention']);

    const result = await aiReviewStage.run(ctx);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.rawFindings).toHaveLength(2);
    expect(result.metrics.llmRequests).toBe(2);
    expect(result.metrics.tokensIn).toBe(200);
    expect(result.metrics.tokensOut).toBe(100);
    expect(result.actualModelUsed).toBe('claude-sonnet-4-5');
  });

  it('treats a per-file provider failure as zero findings for that file, not a pipeline failure', async () => {
    complete.mockReset();
    complete.mockRejectedValue(new Error('rate limited'));

    const ctx = makeContext([makeChangedFile('src/a.ts')], ['code-convention']);
    const result = await aiReviewStage.run(ctx);

    expect(result.rawFindings).toEqual([]);
  });
});
