import type { Finding, Severity } from '../../types/finding.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

const SEVERITY_RANK: Record<Severity, number> = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3, SUGGESTION: 4 };

function bySeverityThenConfidence(a: Finding, b: Finding): number {
  const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (rankDiff !== 0) return rankDiff;
  return b.confidence - a.confidence;
}

/**
 * Not a pipeline no-op: this is where `review.max_comments` is actually
 * enforced — "3 useful findings over 30 speculative ones" as a structural
 * cap, not just a prompt instruction. Keeps the highest-severity,
 * highest-confidence findings and drops the rest. Rendering itself (CLI
 * today, GitHub later) happens outside the pipeline via a Reporter, given
 * the final `ReviewResult`.
 */
export const reportOutputStage: ReviewPipelineStage = {
  name: 'report-output',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const sorted = [...ctx.findings].sort(bySeverityThenConfidence);
    ctx.findings = sorted.slice(0, ctx.config.review.maxComments);
    return ctx;
  },
};
