import { applySeverityClassification } from '../../validation/severity-engine.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const severityClassificationStage: ReviewPipelineStage = {
  name: 'severity-classification',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.findings = applySeverityClassification(ctx.findings, ctx.skills);
    return ctx;
  },
};
