import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { runPipeline } from '../../core/pipeline/pipeline.js';
import { repositoryDiscoveryStage } from '../../core/pipeline/stages/01-repository-discovery.js';
import { gitDiffAnalysisStage } from '../../core/pipeline/stages/02-git-diff-analysis.js';
import { fileClassificationStage } from '../../core/pipeline/stages/03-file-classification.js';
import { skillResolutionStage } from '../../core/pipeline/stages/04-skill-resolution.js';
import { contextRetrievalStage } from '../../core/pipeline/stages/05-context-retrieval.js';
import { staticAnalysisIngestionStage } from '../../core/pipeline/stages/06-static-analysis-ingestion.js';
import { aiReviewStage } from '../../core/pipeline/stages/07-ai-review.js';
import { findingValidationStage } from '../../core/pipeline/stages/08-finding-validation.js';
import { deduplicationStage } from '../../core/pipeline/stages/09-deduplication.js';
import { severityClassificationStage } from '../../core/pipeline/stages/10-severity-classification.js';
import { reportOutputStage } from '../../core/pipeline/stages/11-report-output.js';
import { buildReviewResult } from '../../core/reporting/build-review-result.js';
import { cliReporter } from '../../core/reporting/cli-reporter.js';
import { jsonReporter } from '../../core/reporting/json-reporter.js';
import type { PipelineContext } from '../../core/types/pipeline.js';
import { loadConfig } from '../config/load-config.js';

export const PIPELINE_STAGES = [
  repositoryDiscoveryStage,
  gitDiffAnalysisStage,
  fileClassificationStage,
  skillResolutionStage,
  contextRetrievalStage,
  staticAnalysisIngestionStage,
  aiReviewStage,
  findingValidationStage,
  deduplicationStage,
  severityClassificationStage,
  reportOutputStage,
];

export interface ReviewCommandOptions {
  repo?: string;
  base?: string;
  head?: string;
  provider?: 'anthropic' | 'openai' | 'gemini';
  skill?: string[];
  config?: string;
  json?: boolean;
}

export async function runReviewCommand(options: ReviewCommandOptions): Promise<void> {
  const repoRoot = resolve(options.repo ?? process.cwd());
  const config = loadConfig(repoRoot, {
    provider: options.provider,
    skills: options.skill,
    configPath: options.config,
  });

  const initialContext: PipelineContext = {
    runId: randomUUID(),
    repoRoot,
    config,
    target: {
      baseRef: options.base ?? 'HEAD~1',
      headRef: options.head ?? 'HEAD',
      commitSha: '',
    },
    changedFiles: [],
    skills: [],
    contextBundles: new Map(),
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

  const start = Date.now();
  const finalContext = await runPipeline(PIPELINE_STAGES, initialContext);
  finalContext.metrics.durationMs = Date.now() - start;
  finalContext.metrics.findingsFinal = finalContext.findings.length;

  const result = buildReviewResult(finalContext);
  const reporter = options.json ? jsonReporter : cliReporter;
  await reporter.render(result);
}
