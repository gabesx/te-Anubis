import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import parseDiff from 'parse-diff';
import { run } from '../utils/exec.js';

export interface PatchValidationResult {
  valid: boolean;
  reason?: string;
  touchedFiles: string[];
}

/** Independent of SafetyClassifier's own denylist — defense in depth: even if the
 * classifier were ever bypassed, a patch touching one of these can never be applied. */
const DENYLISTED_PATH_PATTERNS = [
  /(^|\/)\.env(\..*)?$/,
  /\.(pem|key|crt|p12|pfx)$/,
  /(^|\/)secrets?\//i,
  /(^|\/)\.github\/workflows\//,
  /(^|\/)\.git\//,
];

function extractTouchedPaths(patch: string): string[] {
  const files = parseDiff(patch);
  const paths = new Set<string>();
  for (const file of files) {
    if (file.to && file.to !== '/dev/null') paths.add(file.to);
    else if (file.from && file.from !== '/dev/null') paths.add(file.from);
  }
  return [...paths];
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
 * to apply this patch at all.
 */
export async function validatePatch(repoRoot: string, patch: string, expectedFile: string): Promise<PatchValidationResult> {
  const touchedFiles = extractTouchedPaths(patch);

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
    if (DENYLISTED_PATH_PATTERNS.some((p) => p.test(path))) {
      return { valid: false, reason: `path "${path}" matches a denylisted pattern (secrets/keys/CI config)`, touchedFiles };
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
