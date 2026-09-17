import { getChangedFiles, getCommitSha } from '../../repo/git.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const gitDiffAnalysisStage: ReviewPipelineStage = {
  name: 'git-diff-analysis',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    ctx.target.commitSha = await getCommitSha(ctx.repoRoot, ctx.target.headRef);

    const allChangedFiles = await getChangedFiles(ctx.repoRoot, ctx.target.baseRef, ctx.target.headRef);
    const maxFiles = ctx.config.review.maxFiles;

    ctx.changedFiles = allChangedFiles.slice(0, maxFiles);
    ctx.filesSkipped = allChangedFiles.slice(maxFiles).map((f) => f.path);

    return ctx;
  },
};
