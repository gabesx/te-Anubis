import parseDiff from 'parse-diff';
import { simpleGit } from 'simple-git';
import type { ChangedFile, ChangeType, DiffHunk } from '../types/context.js';

export async function getCommitSha(repoRoot: string, ref: string): Promise<string> {
  const git = simpleGit(repoRoot);
  const sha = await git.revparse([ref]);
  return sha.trim();
}

function toChangeType(file: parseDiff.File): ChangeType {
  if (file.new) return 'added';
  if (file.deleted) return 'deleted';
  if (file.from && file.to && file.from !== file.to) return 'renamed';
  return 'modified';
}

function toHunks(file: parseDiff.File): DiffHunk[] {
  return (file.chunks ?? []).map((chunk) => ({
    startLine: chunk.newStart,
    endLine: chunk.newStart + Math.max(chunk.newLines - 1, 0),
    content: chunk.changes.map((c) => c.content).join('\n'),
  }));
}

/**
 * Diffs two refs and returns each changed file's hunks. `language` and
 * `classification` are left as placeholders here — Changed File
 * Classification (stage 03) fills those in; git-diff-analysis only knows
 * about the diff itself.
 */
/**
 * `--unified=20` asks git itself for ~20 lines of surrounding context per
 * hunk, so "the diff" a changed file carries already satisfies the
 * always-included, never-truncated surrounding-context requirement without
 * the Context Engine needing a separate mechanism for it.
 */
export async function getChangedFiles(repoRoot: string, baseRef: string, headRef: string): Promise<ChangedFile[]> {
  const git = simpleGit(repoRoot);
  const diffText = await git.diff([`${baseRef}...${headRef}`, '--unified=20']);
  const files = parseDiff(diffText);

  return files
    .map((file) => {
      const path = file.to && file.to !== '/dev/null' ? file.to : (file.from ?? null);
      if (!path) return null;
      return {
        path,
        changeType: toChangeType(file),
        hunks: toHunks(file),
        language: 'unknown',
        classification: 'unknown',
      } satisfies ChangedFile;
    })
    .filter((f): f is ChangedFile => f !== null);
}

export interface CommitSummary {
  sha: string;
  message: string;
}

/** Last N commit *messages* (not diffs) touching a file — cheap way to convey intent. */
export async function getRecentCommitMessages(repoRoot: string, filePath: string, limit = 5): Promise<CommitSummary[]> {
  const git = simpleGit(repoRoot);
  try {
    const log = await git.log({ file: filePath, maxCount: limit });
    return log.all.map((entry) => ({ sha: entry.hash, message: entry.message }));
  } catch {
    // e.g. file has no history yet (newly added, or not a git repo) — not fatal.
    return [];
  }
}
