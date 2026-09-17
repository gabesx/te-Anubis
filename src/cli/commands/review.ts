import { resolve } from 'node:path';
import { cliReporter } from '../../core/reporting/cli-reporter.js';
import { jsonReporter } from '../../core/reporting/json-reporter.js';
import { runReviewPipeline } from './run-review-pipeline.js';

export interface ReviewCommandOptions {
  repo?: string;
  base?: string;
  head?: string;
  provider?: 'anthropic' | 'openai' | 'gemini';
  skill?: string[];
  config?: string;
  json?: boolean;
}

export async function runReviewCommand(options: ReviewCommandOptions): Promise<void> {
  const repoRoot = resolve(options.repo ?? process.cwd());

  const { result } = await runReviewPipeline({
    repoRoot,
    baseRef: options.base ?? 'HEAD~1',
    headRef: options.head ?? 'HEAD',
    overrides: {
      provider: options.provider,
      skills: options.skill,
      configPath: options.config,
    },
  });

  const reporter = options.json ? jsonReporter : cliReporter;
  await reporter.render(result);
}
