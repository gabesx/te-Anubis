import { Command } from 'commander';
import { runGithubCommandCommand } from './commands/github-command.js';
import { runGithubReviewCommand } from './commands/github-review.js';
import { runReviewCommand } from './commands/review.js';
import { redact } from '../utils/logger.js';

/** Every top-level error path goes through this — redact() is the one thing that must never
 * be skipped, since an error can easily echo back a bad API key or a subprocess's stderr. */
function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[anubis] error: ${redact(message)}`);
  process.exitCode = 1;
}

const program = new Command();

program.name('anubis').description('AI-powered, context-aware code review agent.').version('0.1.0');

program
  .command('review')
  .description('Review local changes (git diff) and print findings.')
  .option('--repo <path>', 'repository root to review', process.cwd())
  .option('--base <ref>', 'base git ref to diff against', 'HEAD~1')
  .option('--head <ref>', 'head git ref to diff', 'HEAD')
  .option('--provider <name>', 'AI provider: auto (default, picks whichever key is set — gemini first) | anthropic | openai | gemini')
  .option('--skill <id>', 'enable a specific skill (repeatable)', (value: string, previous: string[]) => [...previous, value], [] as string[])
  .option('--config <path>', 'path to .anubis.yml')
  .option('--json', 'output as JSON instead of a human-readable report')
  .option('--fix', 'commit SAFE-classified fixes locally (never pushes; see docs/architecture.md)')
  .option('--suggest-fixes', 'show proposed fixes without applying or committing any of them')
  .option('--debug', 'write raw AI prompts/responses to a local .anubis-debug/ directory (never stdout)')
  .action(async (opts) => {
    try {
      await runReviewCommand({
        repo: opts.repo,
        base: opts.base,
        head: opts.head,
        provider: opts.provider,
        skill: opts.skill,
        config: opts.config,
        json: opts.json,
        fix: opts.fix,
        suggestFixes: opts.suggestFixes,
        debug: opts.debug,
      });
    } catch (err) {
      printError(err);
    }
  });

program
  .command('github-review')
  .description('[Internal, run inside GitHub Actions] Review a pull_request event and post inline + summary comments.')
  .action(async () => {
    try {
      await runGithubReviewCommand();
    } catch (err) {
      printError(err);
    }
  });

program
  .command('github-command')
  .description('[Internal, run inside GitHub Actions] Handle an issue_comment event (/anubis review|fix|explain).')
  .action(async () => {
    try {
      await runGithubCommandCommand();
    } catch (err) {
      printError(err);
    }
  });

program.parse();
