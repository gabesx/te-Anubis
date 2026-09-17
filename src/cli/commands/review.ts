import { resolve } from 'node:path';
import { cliReporter } from '../../core/reporting/cli-reporter.js';
import { formatFixResult } from '../../core/reporting/fix-reporter.js';
import { jsonReporter } from '../../core/reporting/json-reporter.js';
import { FixEngine } from '../../fix/fix-engine.js';
import { redact } from '../../utils/logger.js';
import { runReviewPipeline } from './run-review-pipeline.js';

export interface ReviewCommandOptions {
  repo?: string;
  base?: string;
  head?: string;
  provider?: 'anthropic' | 'openai' | 'gemini';
  skill?: string[];
  config?: string;
  json?: boolean;
  fix?: boolean;
  suggestFixes?: boolean;
}

export async function runReviewCommand(options: ReviewCommandOptions): Promise<void> {
  const repoRoot = resolve(options.repo ?? process.cwd());

  const { result, finalContext } = await runReviewPipeline({
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

  if (options.fix || options.suggestFixes) {
    const fixEngine = new FixEngine();
    const fixResult = await fixEngine.run({
      reviewResult: result,
      mode: options.fix ? 'fix' : 'suggest',
      repoRoot,
      allowedSafetyClasses: finalContext.config.fix.allowed,
    });

    if (!options.json) {
      const findingsById = new Map(result.findings.map((f) => [f.id, f]));
      console.log(redact(formatFixResult(fixResult, findingsById)));
    }
  }
}
