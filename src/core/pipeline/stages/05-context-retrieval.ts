import { buildContextBundle } from '../../context/context-engine.js';
import { probeRepo, readRepoManifest } from '../../repo/manifest-reader.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

/** Total per-file token budget, split by `core/context/budget.ts`'s weighted allocation. Not yet configurable — flagged as a heuristic guess pending real usage (see plan risks). */
const DEFAULT_TOKEN_BUDGET_PER_FILE = 6000;

export const contextRetrievalStage: ReviewPipelineStage = {
  name: 'context-retrieval',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const probe = probeRepo(ctx.repoRoot);
    const repoManifest = ctx.repoManifest ?? readRepoManifest(ctx.repoRoot, probe);

    for (const changedFile of ctx.changedFiles) {
      const bundle = await buildContextBundle(changedFile, {
        repoRoot: ctx.repoRoot,
        probe,
        repoManifest,
        projectInstructions: ctx.projectInstructions,
        tokenBudget: DEFAULT_TOKEN_BUDGET_PER_FILE,
      });
      ctx.contextBundles.set(changedFile.path, bundle);
    }

    return ctx;
  },
};
