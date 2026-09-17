import { buildDetectionContext } from '../../skills/detector.js';
import { resolveSkills } from '../../skills/resolve.js';
import { loadAllSkills } from '../../skills/skill-registry.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

export const skillResolutionStage: ReviewPipelineStage = {
  name: 'skill-resolution',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const allSkills = loadAllSkills(ctx.repoRoot);
    const detectionContext = buildDetectionContext(ctx.repoRoot);

    ctx.skills = resolveSkills(allSkills, ctx.changedFiles, {
      autoDetect: ctx.config.skills.autoDetect,
      enabled: ctx.config.skills.enabled,
      detectionContext,
    });

    return ctx;
  },
};
