import type { RepoProbe } from '../repo/manifest-reader.js';
import { getRecentCommitMessages } from '../repo/git.js';
import type { ChangedFile, ContextBundle, RepoManifestInfo } from '../types/context.js';
import { allocateBudget, estimateTokens, truncateToTokenBudget } from './budget.js';
import { findRelatedFiles } from './related-file-finder.js';

export interface BuildContextBundleOptions {
  repoRoot: string;
  probe: RepoProbe;
  repoManifest: RepoManifestInfo;
  projectInstructions?: string;
  tokenBudget: number;
}

function hunksToText(changedFile: ChangedFile): string {
  return changedFile.hunks.map((h) => h.content).join('\n');
}

/**
 * Builds one budgeted `ContextBundle` for a single changed file. Diff hunks
 * are never truncated here — the git-diff-analysis stage already asked git
 * for a wide unified-diff context window, so "the diff" already carries its
 * own surrounding lines; everything else in this bundle is truncated to its
 * budget share, lowest-priority first, before the diff would ever be cut.
 */
export async function buildContextBundle(changedFile: ChangedFile, options: BuildContextBundleOptions): Promise<ContextBundle> {
  const budget = allocateBudget(options.tokenBudget);

  const diffText = hunksToText(changedFile);
  let tokensUsed = estimateTokens(diffText);

  const relatedFiles = findRelatedFiles(changedFile.path, options.probe).map((rf) => ({
    ...rf,
    excerpt: truncateToTokenBudget(rf.excerpt, Math.max(Math.floor(budget.relatedFilesTokens / 5), 20)),
  }));
  tokensUsed += relatedFiles.reduce((sum, rf) => sum + estimateTokens(rf.excerpt), 0);

  tokensUsed += estimateTokens(JSON.stringify(options.repoManifest));

  const relevantHistory = await getRecentCommitMessages(options.repoRoot, changedFile.path, 5);
  tokensUsed += relevantHistory.reduce((sum, h) => sum + estimateTokens(h.message), 0);

  const projectInstructions = options.projectInstructions
    ? truncateToTokenBudget(options.projectInstructions, budget.historyTokens)
    : undefined;
  if (projectInstructions) tokensUsed += estimateTokens(projectInstructions);

  return {
    changedFile,
    relatedFiles,
    repoManifest: options.repoManifest,
    projectInstructions,
    relevantHistory,
    tokenBudget: options.tokenBudget,
    tokensUsed,
  };
}
