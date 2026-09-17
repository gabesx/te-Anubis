import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPatches, commitFixes, pushCommit, revertFiles } from '../../src/fix/git-commit-engine.js';

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

  it('stages a hyphen-prefixed filename correctly instead of it being misread as a git flag', async () => {
    const weirdName = '-weird-name.ts';
    writeFileSync(join(repoRoot, weirdName), 'export const a = 1;\n');
    const git = simpleGit(repoRoot);
    await git.add('.');
    await git.commit('add weird file');

    const weirdPatch = `--- a/${weirdName}\n+++ b/${weirdName}\n@@ -1,1 +1,2 @@\n export const a = 1;\n+export const b = 2;\n`;
    await applyPatches(repoRoot, [{ findingId: 'f1', patch: weirdPatch, file: weirdName, description: 'added b' }]);
    const result = await commitFixes(repoRoot, [{ findingId: 'f1', patch: weirdPatch, file: weirdName, description: 'added b' }]);

    expect(result.committed).toBe(true);
    const status = await git.status();
    expect(status.files).toEqual([]);
  });

  it('stages only the touched files, not everything in the working tree', async () => {
    writeFileSync(join(repoRoot, 'src', 'untouched.ts'), 'export const untouched = true;\n');
    await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
    await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);

    const git = simpleGit(repoRoot);
    const status = await git.status();
    expect(status.not_added).toContain('src/untouched.ts');
  });

  it('reports a clean failure (not a throw) when `git add` fails, e.g. a nonexistent touched-file path', async () => {
    const result = await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/does-not-exist.ts', description: 'x' }]);
    expect(result.committed).toBe(false);
    expect(result.reason).toMatch(/git add failed/);
  });

  it('reports a clean failure when `git commit` fails, e.g. nothing staged actually changed', async () => {
    // `git add` on an untouched, already-committed file succeeds (nothing to add is not an error),
    // but the subsequent `git commit` has nothing new to record.
    const result = await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'no-op' }]);
    expect(result.committed).toBe(false);
    expect(result.reason).toMatch(/git commit failed/);
  });

  describe('pushCommit', () => {
    let remoteRoot: string;

    beforeEach(async () => {
      remoteRoot = mkdtempSync(join(tmpdir(), 'anubis-commit-engine-remote-'));
      await simpleGit(remoteRoot).init(['--bare']);
      const git = simpleGit(repoRoot);
      await git.addRemote('origin', remoteRoot);
      // Establish the remote's initial state matching the local repo's current branch/history.
      const branch = (await git.raw(['branch', '--show-current'])).trim();
      await git.push('origin', `HEAD:${branch || 'main'}`);
    });

    afterEach(() => {
      rmSync(remoteRoot, { recursive: true, force: true });
    });

    it('pushes a fast-forward commit successfully', async () => {
      await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
      await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);

      const git = simpleGit(repoRoot);
      const branch = (await git.raw(['branch', '--show-current'])).trim() || 'main';
      const result = await pushCommit(repoRoot, 'origin', branch);

      expect(result.pushed).toBe(true);

      const remoteLog = await simpleGit(remoteRoot).log({ maxCount: 1 });
      expect(remoteLog.latest?.message).toContain('fix(anubis): address automated review findings');
    });

    it('fails cleanly (never force-pushes) when the remote has diverged (non-fast-forward)', async () => {
      // Simulate someone else pushing to the remote in the meantime: clone it, commit, push.
      const otherClone = mkdtempSync(join(tmpdir(), 'anubis-commit-engine-other-clone-'));
      try {
        const branch = (await simpleGit(repoRoot).raw(['branch', '--show-current'])).trim() || 'main';
        await simpleGit().clone(remoteRoot, otherClone);
        const otherGit = simpleGit(otherClone);
        await otherGit.addConfig('user.email', 'other@example.com');
        await otherGit.addConfig('user.name', 'Other');
        writeFileSync(join(otherClone, 'unrelated.ts'), 'export const other = true;\n');
        await otherGit.add('.');
        await otherGit.commit('someone else pushed first');
        await otherGit.push('origin', branch);

        // Now our local repo's push is no longer a fast-forward.
        await applyPatches(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
        await commitFixes(repoRoot, [{ findingId: 'f1', patch, file: 'src/foo.ts', description: 'added bar' }]);
        const result = await pushCommit(repoRoot, 'origin', branch);

        expect(result.pushed).toBe(false);
        expect(result.reason).toBeTruthy();
      } finally {
        rmSync(otherClone, { recursive: true, force: true });
      }
    });
  });
});
