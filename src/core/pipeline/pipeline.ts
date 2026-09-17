import { PipelineStageError } from '../../utils/errors.js';
import type { PipelineContext, ReviewPipelineStage } from '../types/pipeline.js';

/**
 * Deliberately dumb: an ordered array of stages, executed sequentially. No
 * DAG, no conditional branching, no plugin hooks — each stage is independently
 * testable by calling `stage.run(fixtureCtx)` directly. Reordering or
 * replacing stages in tests is the only "extensibility" this needs.
 */
export async function runPipeline(
  stages: ReviewPipelineStage[],
  initialContext: PipelineContext,
): Promise<PipelineContext> {
  let ctx = initialContext;
  for (const stage of stages) {
    const start = Date.now();
    try {
      ctx = await stage.run(ctx);
    } catch (err) {
      throw new PipelineStageError(stage.name, err);
    }
    ctx.metrics.stageDurations[stage.name] = Date.now() - start;
  }
  return ctx;
}
