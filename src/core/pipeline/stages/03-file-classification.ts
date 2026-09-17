import { classifyFile, detectLanguage } from '../../repo/repository-analyzer.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const fileClassificationStage: ReviewPipelineStage = {
  name: 'file-classification',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.changedFiles = ctx.changedFiles.map((file) => ({
      ...file,
      language: detectLanguage(file.path),
      classification: classifyFile(file.path),
    }));
    return ctx;
  },
};
