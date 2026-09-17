import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../utils/exec.js';

export interface FixToApply {
  findingId: string;
  patch: string;
  file: string;
  description: string;
}

export interface ApplyResult {
  applied: boolean;
  touchedFiles: string[];
  reason?: string;
}

/** Applies every patch in the batch via `git apply` (uncommitted, working-tree only).
 * On any failure, reverts everything already applied in this batch before returning —
 * never leaves a partially-applied, uncommitted mess. */
export async function applyPatches(repoRoot: string, fixes: FixToApply[]): Promise<ApplyResult> {
  const touchedFiles = [...new Set(fixes.map((f) => f.file))];
  const tmpDir = mkdtempSync(join(tmpdir(), 'anubis-fix-'));

  try {
    for (const fix of fixes) {
      const patchFile = join(tmpDir, `${fix.findingId}.patch`);
      writeFileSync(patchFile, fix.patch.endsWith('\n') ? fix.patch : `${fix.patch}\n`);
      const applyResult = await run('git', ['apply', patchFile], { cwd: repoRoot, timeoutMs: 15_000 });
      if (applyResult.exitCode !== 0) {
        await revertFiles(repoRoot, touchedFiles);
        return { applied: false, touchedFiles, reason: `failed to apply patch for finding ${fix.findingId}: ${applyResult.stderr.trim()}` };
      }
    }
    return { applied: true, touchedFiles };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** `git checkout -- <files>` — discards uncommitted changes to exactly these files, nothing else. */
export async function revertFiles(repoRoot: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await run('git', ['checkout', '--', ...files], { cwd: repoRoot, timeoutMs: 15_000 });
}

export interface CommitResult {
  committed: boolean;
  sha?: string;
  reason?: string;
}

/**
 * Stages exactly the touched files (never `git add -A`/`.`) and commits with
 * the fixed message convention. Assumes patches are already applied on disk
 * (via `applyPatches`) and validated/sandbox-checked — this function only
 * does the git mechanics, no safety judgment of its own.
 *
 * Author/committer identity is whatever `git config user.name`/`user.email`
 * the calling environment has already configured (e.g. a workflow step
 * setting up a `github-actions[bot]` identity) — this deliberately never
 * hardcodes or overrides that, and never impersonates the PR author.
 */
export async function commitFixes(repoRoot: string, fixes: FixToApply[]): Promise<CommitResult> {
  const touchedFiles = [...new Set(fixes.map((f) => f.file))];

  const addResult = await run('git', ['add', ...touchedFiles], { cwd: repoRoot, timeoutMs: 15_000 });
  if (addResult.exitCode !== 0) {
    await revertFiles(repoRoot, touchedFiles);
    return { committed: false, reason: `git add failed: ${addResult.stderr.trim()}` };
  }

  const message = ['fix(anubis): address automated review findings', '', ...fixes.map((f) => `- ${f.description}`), '', 'Generated-by: TE-Anubis'].join(
    '\n',
  );

  const commitResult = await run('git', ['commit', '-m', message], { cwd: repoRoot, timeoutMs: 30_000 });
  if (commitResult.exitCode !== 0) {
    return { committed: false, reason: `git commit failed: ${commitResult.stderr.trim()}` };
  }

  const shaResult = await run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, timeoutMs: 5_000 });
  return { committed: true, sha: shaResult.stdout.trim() };
}

/**
 * Fast-forward-only push — never `--force`. A non-fast-forward rejection
 * (someone pushed in the meantime, or branch protection blocks direct pushes)
 * is treated as an expected outcome for the caller to fall back on, not
 * something to retry more aggressively.
 */
export async function pushCommit(repoRoot: string, remote: string, branch: string): Promise<{ pushed: boolean; reason?: string }> {
  const result = await run('git', ['push', remote, `HEAD:${branch}`], { cwd: repoRoot, timeoutMs: 30_000 });
  if (result.exitCode !== 0) {
    return { pushed: false, reason: result.stderr.trim() };
  }
  return { pushed: true };
}
