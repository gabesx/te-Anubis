import type { PipelineContext } from '../types/pipeline.js';
import type { ReviewResult } from '../types/review-result.js';
import type { Severity } from '../types/finding.js';

const SEVERITIES: Severity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'SUGGESTION'];

export function buildReviewResult(ctx: PipelineContext, repoRemoteUrl?: string): ReviewResult {
  const countsBySeverity = SEVERITIES.reduce(
    (acc, severity) => {
      acc[severity] = ctx.findings.filter((f) => f.severity === severity).length;
      return acc;
    },
    {} as Record<Severity, number>,
  );

  return {
    runId: ctx.runId,
    repo: { root: ctx.repoRoot, remoteUrl: repoRemoteUrl },
    target: ctx.target,
    provider: { name: ctx.config.ai.provider, model: ctx.actualModelUsed ?? ctx.config.ai.model ?? '(default)' },
    skillsUsed: ctx.skills.map((s) => s.frontmatter.id),
    findings: ctx.findings,
    summary: {
      countsBySeverity,
      filesAnalyzed: ctx.changedFiles.length,
      filesSkipped: ctx.filesSkipped.length,
    },
    validation: ctx.validation,
    metrics: ctx.metrics,
    generatedAt: new Date().toISOString(),
  };
}
