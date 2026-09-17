import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import parseDiff from 'parse-diff';
import { run } from '../utils/exec.js';
import { matchesSecurityDenylist } from './denylist.js';

export interface PatchValidationResult {
  valid: boolean;
  reason?: string;
  touchedFiles: string[];
}

const SYMLINK_GIT_MODE = '120000';

function parsePatch(patch: string): parseDiff.File[] {
  return parseDiff(patch);
}

function extractTouchedPaths(files: parseDiff.File[]): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    if (file.to && file.to !== '/dev/null') paths.add(file.to);
    else if (file.from && file.from !== '/dev/null') paths.add(file.from);
  }
  return [...paths];
}

/** A symlink-mode entry (`120000`) has "content" that's actually a target path, not the file's
 * real contents — PatchValidator's own realpath-based escape check only covers paths that
 * already exist on disk, so a patch that *creates* a symlink pointing outside the repo would
 * otherwise slip past it. Rejected outright regardless of what the diff's shape looks like. */
function hasSymlinkMode(files: parseDiff.File[]): boolean {
  return files.some((f) => f.newMode === SYMLINK_GIT_MODE || f.oldMode === SYMLINK_GIT_MODE);
}

/** Resolves + realpath-checks against the repo root — rejects `..`/absolute paths outright
 * and, for paths that already exist on disk, follows symlinks to catch a symlink escape. */
function resolvesInsideRepo(repoRoot: string, relativePath: string): boolean {
  if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) return false;

  const repoRootReal = realpathSync(repoRoot);
  const resolved = resolve(repoRootReal, relativePath);
  if (resolved !== repoRootReal && !resolved.startsWith(`${repoRootReal}/`)) return false;

  if (existsSync(resolved)) {
    const resolvedReal = realpathSync(resolved);
    if (resolvedReal !== repoRootReal && !resolvedReal.startsWith(`${repoRootReal}/`)) return false;
  }
  return true;
}

/**
 * Structural validation only — no judgment about whether the *change* is a
 * good idea (that's SafetyClassifier's job). This purely answers: is it safe
 * to apply this patch at all. Independent of SafetyClassifier's own denylist
 * check (both import the same `matchesSecurityDenylist`, but this runs
 * regardless of classification) — defense in depth, not a duplicate no-op.
 */
export async function validatePatch(repoRoot: string, patch: string, expectedFile: string): Promise<PatchValidationResult> {
  let parsedFiles: parseDiff.File[];
  try {
    parsedFiles = parsePatch(patch);
  } catch {
    return { valid: false, reason: 'patch could not be parsed as a unified diff', touchedFiles: [] };
  }

  if (hasSymlinkMode(parsedFiles)) {
    return { valid: false, reason: 'patch creates or modifies a symlink — never applied automatically', touchedFiles: extractTouchedPaths(parsedFiles) };
  }

  const touchedFiles = extractTouchedPaths(parsedFiles);

  if (touchedFiles.length === 0) {
    return { valid: false, reason: 'patch touches no files', touchedFiles };
  }
  if (touchedFiles.length > 1 || touchedFiles[0] !== expectedFile) {
    return {
      valid: false,
      reason: `patch touches [${touchedFiles.join(', ')}], expected only the finding's own file "${expectedFile}"`,
      touchedFiles,
    };
  }

  for (const path of touchedFiles) {
    if (!resolvesInsideRepo(repoRoot, path)) {
      return { valid: false, reason: `path "${path}" resolves outside the repository root`, touchedFiles };
    }
    if (matchesSecurityDenylist(path)) {
      return { valid: false, reason: `path "${path}" matches a denylisted pattern (secrets/keys/CI config/auth/payment)`, touchedFiles };
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'anubis-patch-'));
  const patchFile = join(tmpDir, 'fix.patch');
  try {
    writeFileSync(patchFile, patch.endsWith('\n') ? patch : `${patch}\n`);
    const result = await run('git', ['apply', '--check', patchFile], { cwd: repoRoot, timeoutMs: 15_000 });
    if (result.exitCode !== 0) {
      return { valid: false, reason: `patch does not apply cleanly: ${result.stderr.trim() || result.stdout.trim()}`, touchedFiles };
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return { valid: true, touchedFiles };
}
