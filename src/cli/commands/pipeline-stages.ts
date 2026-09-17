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
import type { ReviewPipelineStage } from '../../core/types/pipeline.js';

/** Shared by every entry point (local CLI review, GitHub PR review, GitHub PR comment commands) — one pipeline, multiple front ends. */
export const PIPELINE_STAGES: ReviewPipelineStage[] = [
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
