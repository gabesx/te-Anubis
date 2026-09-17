import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getChangedFiles, getCommitSha, getRecentCommitMessages } from '../../src/core/repo/git.js';

describe('git repo analysis', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-git-test-'));
    const git = simpleGit(repoRoot);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Anubis Test');

    writeFileSync(join(repoRoot, 'foo.ts'), 'export const a = 1;\n');
    await git.add('.');
    await git.commit('initial commit');

    writeFileSync(join(repoRoot, 'foo.ts'), 'export const a = 1;\nexport const b = 2;\n');
    writeFileSync(join(repoRoot, 'bar.ts'), 'export const c = 3;\n');
    await git.add('.');
    await git.commit('add bar.ts and extend foo.ts');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('resolves a ref to its full commit SHA', async () => {
    const sha = await getCommitSha(repoRoot, 'HEAD');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns changed files between two refs, classified by change type', async () => {
    const changedFiles = await getChangedFiles(repoRoot, 'HEAD~1', 'HEAD');
    const byPath = Object.fromEntries(changedFiles.map((f) => [f.path, f]));

    expect(byPath['foo.ts']?.changeType).toBe('modified');
    expect(byPath['bar.ts']?.changeType).toBe('added');
  });

  it('includes hunk content for a modified file', async () => {
    const changedFiles = await getChangedFiles(repoRoot, 'HEAD~1', 'HEAD');
    const foo = changedFiles.find((f) => f.path === 'foo.ts');
    expect(foo?.hunks.length).toBeGreaterThan(0);
    expect(foo?.hunks[0]?.content).toContain('export const b = 2;');
  });

  it('returns recent commit messages for a specific file', async () => {
    const history = await getRecentCommitMessages(repoRoot, 'foo.ts', 5);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.map((h) => h.message)).toContain('add bar.ts and extend foo.ts');
  });

  it('returns an empty array for a file with no history rather than throwing', async () => {
    const history = await getRecentCommitMessages(repoRoot, 'does-not-exist.ts', 5);
    expect(history).toEqual([]);
  });
});
