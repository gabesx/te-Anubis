import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/core/pipeline/pipeline.js';
import { PipelineStageError } from '../../src/utils/errors.js';
import type { PipelineContext, ReviewPipelineStage } from '../../src/core/types/pipeline.js';

function makeContext(): PipelineContext {
  return {
    runId: 'test-run',
    repoRoot: '/tmp/fake-repo',
    config: {
      version: 1,
      ai: { provider: 'anthropic' },
      review: { minimumConfidence: 0.7, maxComments: 15, maxFiles: 50 },
      skills: { autoDetect: true, enabled: [] },
      github: { inlineComments: true, summary: true },
      fix: { enabled: false, autoCommit: false, allowed: ['SAFE'] },
    },
    target: { baseRef: 'HEAD~1', headRef: 'HEAD', commitSha: '' },
    changedFiles: [],
    skills: [],
    contextBundles: new Map(),
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

describe('runPipeline', () => {
  it('executes stages in order, threading context through each', async () => {
    const order: string[] = [];
    const stages: ReviewPipelineStage[] = [
      {
        name: 'first',
        async run(ctx) {
          order.push('first');
          ctx.changedFiles.push({ path: 'a.ts', changeType: 'modified', hunks: [], language: 'typescript', classification: 'source' });
          return ctx;
        },
      },
      {
        name: 'second',
        async run(ctx) {
          order.push('second');
          expect(ctx.changedFiles).toHaveLength(1);
          return ctx;
        },
      },
    ];

    const result = await runPipeline(stages, makeContext());
    expect(order).toEqual(['first', 'second']);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.metrics.stageDurations.first).toBeDefined();
    expect(result.metrics.stageDurations.second).toBeDefined();
  });

  it('wraps a stage failure in a PipelineStageError naming the failing stage', async () => {
    const stages: ReviewPipelineStage[] = [
      {
        name: 'boom',
        async run(): Promise<PipelineContext> {
          throw new Error('something went wrong');
        },
      },
    ];

    await expect(runPipeline(stages, makeContext())).rejects.toThrow(PipelineStageError);
    await expect(runPipeline(stages, makeContext())).rejects.toThrow(/boom/);
  });

  it('produces an empty, well-formed result when all stages are pass-through stubs', async () => {
    const stages: ReviewPipelineStage[] = [{ name: 'noop', async run(ctx) { return ctx; } }];
    const result = await runPipeline(stages, makeContext());
    expect(result.findings).toEqual([]);
    expect(result.rawFindings).toEqual([]);
  });
});
