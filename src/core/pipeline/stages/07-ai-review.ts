import pLimit from 'p-limit';
import { createProvider } from '../../providers/provider-factory.js';
import type { ChangedFile, ContextBundle } from '../../types/context.js';
import type { Finding } from '../../types/finding.js';
import type { PipelineContext, ResolvedSkill, ReviewPipelineStage } from '../../types/pipeline.js';
import { AI_REVIEW_SYSTEM_PROMPT, buildUserPrompt } from '../ai-review/build-prompt.js';
import { parseFindings } from '../ai-review/parse-findings.js';

const MAX_CONCURRENT_REQUESTS = 4;
const MAX_OUTPUT_TOKENS = 2048;

interface ReviewTask {
  file: ChangedFile;
  matchedSkills: ResolvedSkill[];
  bundle: ContextBundle;
}

function buildTasks(ctx: PipelineContext): ReviewTask[] {
  const tasks: ReviewTask[] = [];
  for (const file of ctx.changedFiles) {
    const matchedSkills = ctx.skills.filter((s) => s.matchedFiles.includes(file.path));
    const bundle = ctx.contextBundles.get(file.path);
    if (matchedSkills.length > 0 && bundle) {
      tasks.push({ file, matchedSkills, bundle });
    }
  }
  return tasks;
}

/**
 * Map-reduce, one request per changed file (not one giant request for the
 * whole diff): "map" is this loop, bounded to MAX_CONCURRENT_REQUESTS
 * in-flight; "reduce" is the plain concatenation into rawFindings —
 * cross-file consolidation happens in the dedicated validation/dedup/
 * severity stages, not here. Batching multiple related files into a single
 * request (the plan's stretch heuristic) is a documented simplification
 * deferred past MVP; per-file requests already satisfy the "avoid one
 * enormous request" requirement.
 */
export const aiReviewStage: ReviewPipelineStage = {
  name: 'ai-review',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const tasks = buildTasks(ctx);
    if (tasks.length === 0) {
      ctx.rawFindings = [];
      return ctx;
    }

    const provider = createProvider(ctx.config.ai.provider, ctx.config.ai.model);
    const limit = pLimit(MAX_CONCURRENT_REQUESTS);

    const perFileFindings = await Promise.all(
      tasks.map((task) =>
        limit(async (): Promise<Finding[]> => {
          const allowedSkills = new Map(task.matchedSkills.map((s) => [s.frontmatter.id, s.frontmatter.autoFixable]));
          const userPrompt = buildUserPrompt(task.bundle, task.matchedSkills);

          try {
            const response = await provider.complete({
              systemPrompt: AI_REVIEW_SYSTEM_PROMPT,
              userPrompt,
              maxTokens: MAX_OUTPUT_TOKENS,
            });

            ctx.metrics.llmRequests += 1;
            ctx.metrics.tokensIn += response.usage.inputTokens;
            ctx.metrics.tokensOut += response.usage.outputTokens;
            ctx.metrics.estimatedCostUsd += provider.estimateCost(response.usage);
            ctx.actualModelUsed ??= response.model;

            return parseFindings(response.text, { filePath: task.file.path, allowedSkills });
          } catch {
            // A single file's AI request failing doesn't take down the whole
            // review — it's reported as zero findings for that file.
            return [];
          }
        }),
      ),
    );

    ctx.rawFindings = perFileFindings.flat();
    ctx.metrics.findingsGenerated = ctx.rawFindings.length;
    return ctx;
  },
};
