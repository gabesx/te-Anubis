import { deduplicateFindings } from '../../validation/dedup.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const deduplicationStage: ReviewPipelineStage = {
  name: 'deduplication',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.findings = deduplicateFindings(ctx.findings);
    return ctx;
  },
};
