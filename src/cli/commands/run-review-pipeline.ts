import { randomUUID } from 'node:crypto';
import { runPipeline } from '../../core/pipeline/pipeline.js';
import { buildReviewResult } from '../../core/reporting/build-review-result.js';
import type { ChangedFile } from '../../core/types/context.js';
import type { PipelineContext } from '../../core/types/pipeline.js';
import type { ReviewResult } from '../../core/types/review-result.js';
import { loadConfig, type CliOverrides } from '../config/load-config.js';
import { PIPELINE_STAGES } from './pipeline-stages.js';

export interface RunReviewPipelineOptions {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  prNumber?: number;
  overrides?: CliOverrides;
  /** Local-only directory for `ai-review` to dump raw prompt/response pairs — the `--debug`
   * escape hatch. Unset (the default) writes nothing. */
  debugDir?: string;
}

export interface RunReviewPipelineResult {
  result: ReviewResult;
  changedFiles: ChangedFile[];
  finalContext: PipelineContext;
}

/** The one place that assembles a `PipelineContext`, runs the pipeline, and builds a `ReviewResult` —
 * used by the local CLI `review` command and both GitHub entry points, so they can't drift apart. */
export async function runReviewPipeline(options: RunReviewPipelineOptions): Promise<RunReviewPipelineResult> {
  const config = loadConfig(options.repoRoot, options.overrides);

  const initialContext: PipelineContext = {
    runId: randomUUID(),
    repoRoot: options.repoRoot,
    config,
    target: {
      baseRef: options.baseRef,
      headRef: options.headRef,
      commitSha: '',
      prNumber: options.prNumber,
    },
    changedFiles: [],
    skills: [],
    contextBundles: new Map(),
    lintIssues: [],
    validation: {},
    debugDir: options.debugDir,
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

  const start = Date.now();
  const finalContext = await runPipeline(PIPELINE_STAGES, initialContext);
  finalContext.metrics.durationMs = Date.now() - start;
  finalContext.metrics.findingsFinal = finalContext.findings.length;

  const result = buildReviewResult(finalContext);
  return { result, changedFiles: finalContext.changedFiles, finalContext };
}
