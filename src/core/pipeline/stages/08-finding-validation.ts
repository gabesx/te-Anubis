import { validateFindings } from '../../validation/finding-validator.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const findingValidationStage: ReviewPipelineStage = {
  name: 'finding-validation',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const changedFilesByPath = new Map(ctx.changedFiles.map((f) => [f.path, f]));

    const validated = validateFindings(ctx.rawFindings, {
      changedFilesByPath,
      lintIssues: ctx.lintIssues,
      minimumConfidence: ctx.config.review.minimumConfidence,
    });

    ctx.findings = validated.filter((f) => f.status === 'validated');
    ctx.metrics.findingsRejected = validated.length - ctx.findings.length;
    return ctx;
  },
};
