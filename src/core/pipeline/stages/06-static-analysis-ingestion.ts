import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { run } from '../../../utils/exec.js';
import type { ChangedFile } from '../../types/context.js';
import type { LintIssue, PipelineContext, ReviewPipelineStage } from '../../types/pipeline.js';
import type { ToolCheckResult } from '../../types/review-result.js';

interface EslintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  severity: number;
}
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

interface EslintRunResult {
  result?: ToolCheckResult;
  issues: LintIssue[];
}

/**
 * Shells out to the TARGET repo's own installed eslint (not ours) — the
 * point is to ingest what the project's own tooling already caught, not to
 * run a second opinion. Missing/not-installed eslint is not an error: it
 * just means this validation checklist entry stays unset.
 */
async function runEslint(repoRoot: string, changedFiles: ChangedFile[]): Promise<EslintRunResult> {
  const eslintBin = join(repoRoot, 'node_modules', '.bin', 'eslint');
  if (!existsSync(eslintBin)) return { issues: [] };

  const lintableFiles = changedFiles.filter((f) => f.language === 'typescript' || f.language === 'javascript').map((f) => f.path);
  if (lintableFiles.length === 0) {
    return { result: { tool: 'eslint', passed: true, summary: 'no lintable files changed' }, issues: [] };
  }

  // `--` stops eslint's own arg parser from treating a changed-file path as a flag — file paths
  // come from the diff (attacker-influenced on an untrusted PR), e.g. a file literally named
  // "--rulesdir=..." must be read as a filename, never as an eslint option.
  const exec = await run(eslintBin, ['--format', 'json', '--', ...lintableFiles], { cwd: repoRoot, timeoutMs: 60_000 });

  let parsed: EslintFileResult[];
  try {
    parsed = JSON.parse(exec.stdout) as EslintFileResult[];
  } catch {
    return { result: { tool: 'eslint', passed: exec.exitCode === 0, summary: 'eslint output could not be parsed' }, issues: [] };
  }

  const issues: LintIssue[] = [];
  let errorCount = 0;
  for (const file of parsed) {
    const relPath = relative(repoRoot, file.filePath);
    for (const msg of file.messages) {
      issues.push({ file: relPath, line: msg.line, ruleId: msg.ruleId, message: msg.message });
      if (msg.severity === 2) errorCount += 1;
    }
  }

  return {
    result: { tool: 'eslint', passed: errorCount === 0, summary: errorCount === 0 ? 'no lint errors' : `${errorCount} lint error(s)` },
    issues,
  };
}

async function runTypecheck(repoRoot: string, hasTsConfig: boolean): Promise<ToolCheckResult | undefined> {
  if (!hasTsConfig) return undefined;
  const tscBin = join(repoRoot, 'node_modules', '.bin', 'tsc');
  if (!existsSync(tscBin)) return undefined;

  const exec = await run(tscBin, ['--noEmit'], { cwd: repoRoot, timeoutMs: 120_000 });
  return {
    tool: 'tsc',
    passed: exec.exitCode === 0,
    summary: exec.exitCode === 0 ? 'no type errors' : 'type errors found',
  };
}

export const staticAnalysisIngestionStage: ReviewPipelineStage = {
  name: 'static-analysis-ingestion',
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    const { result: lintResult, issues } = await runEslint(ctx.repoRoot, ctx.changedFiles);
    const typecheckResult = await runTypecheck(ctx.repoRoot, ctx.repoManifest?.raw.hasTypescriptConfig === true);

    ctx.lintIssues = issues;
    ctx.validation = { lint: lintResult, typecheck: typecheckResult };
    return ctx;
  },
};
