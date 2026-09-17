import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPatches, commitFixes, revertFiles } from '../../src/fix/git-commit-engine.js';

describe('git-commit-engine', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-commit-engine-test-'));
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'foo.ts'), 'export function foo() {\n  return 1;\n}\n');

    const git = simpleGit(repoRoot);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Anubis Test');
    await git.add('.');
    await git.commit('initial');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  const patch = `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,3 +1,4 @@\n export function foo() {\n   return 1;\n }\n+export function bar() { return 2; }\n`;

  it('applies a patch to the working tree without committing', async () => {
    const result = await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    expect(result.applied).toBe(true);
    expect(readFileSync(join(repoRoot, 'src', 'foo.ts'), 'utf-8')).toContain('function bar()');

    const git = simpleGit(repoRoot);
    const status = await git.status();
    expect(status.modified).toContain('src/foo.ts');
  });

  it('reverts everything applied in a batch when one patch fails to apply', async () => {
    const badPatch = `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,3 +1,3 @@\n export function foo() {\n-  return 999;\n+  return 2;\n }\n`;
    const result = await applyPatches(repoRoot, [
      { findingId: 'f1', patch, file: 'src/foo.ts', description: 'ok' },
      { findingId: 'f2', patch: badPatch, file: 'src/foo.ts', description: 'bad' },
    ]);
    expect(result.applied).toBe(false);

    const git = simpleGit(repoRoot);
    const status = await git.status();
    expect(status.modified).toEqual([]);
  });

  it('commits applied patches with the fixed message convention and a Generated-by trailer', async () => {
    await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    const result = await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar function' }]);

    expect(result.committed).toBe(true);
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

    const git = simpleGit(repoRoot);
    const log = await git.log({ maxCount: 1 });
    const message = log.latest?.message ?? '';
    expect(message).toContain('fix(anubis): address automated review findings');

    const fullMessage = await git.show(['-s', '--format=%B', 'HEAD']);
    expect(fullMessage).toContain('added bar function');
    expect(fullMessage).toContain('Generated-by: TE-Anubis');
  });

  it('never uses --force and produces a fast-forward commit on top of HEAD, never rewriting history', async () => {
    const git = simpleGit(repoRoot);
    const beforeSha = (await git.revparse(['HEAD'])).trim();

    await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    const result = await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);

    const parents = (await git.raw(['rev-list', '--parents', '-n', '1', result.sha!])).trim().split(' ');
    expect(parents).toContain(beforeSha);
    expect(parents[0]).toBe(result.sha);
  });

  it('reverts only the specified files via git checkout, discarding uncommitted changes to them', async () => {
    await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    await revertFiles(repoRoot, ['src/foo.ts']);
    expect(readFileSync(join(repoRoot, 'src', 'foo.ts'), 'utf-8')).not.toContain('function bar()');
  });

  it('stages only the touched files, not everything in the working tree', async () => {
    writeFileSync(join(repoRoot, 'src', 'untouched.ts'), 'export const untouched = true;\n');
    await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);

    const git = simpleGit(repoRoot);
    const status = await git.status();
    expect(status.not_added).toContain('src/untouched.ts');
  });
});
