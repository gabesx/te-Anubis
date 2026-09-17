import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeRepo, readRepoManifest } from '../../repo/manifest-reader.js';
import type { PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';

/** Well-known "instructions for an AI agent" filenames, checked in priority order. First match wins. */
const PROJECT_INSTRUCTIONS_FILES = ['.anubis/instructions.md', 'CLAUDE.md', 'AGENTS.md'];

function readProjectInstructions(repoRoot: string): string | undefined {
  for (const name of PROJECT_INSTRUCTIONS_FILES) {
    const path = join(repoRoot, name);
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }
  return undefined;
}

export const repositoryDiscoveryStage: ReviewPipelineStage = {
  name: 'repository-discovery',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const probe = probeRepo(ctx.repoRoot);
    ctx.repoManifest = readRepoManifest(ctx.repoRoot, probe);
    ctx.projectInstructions = readProjectInstructions(ctx.repoRoot);
    return ctx;
  },
};
