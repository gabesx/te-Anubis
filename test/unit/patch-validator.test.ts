import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validatePatch } from '../../src/fix/patch-validator.js';

describe('validatePatch', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-patch-validator-test-'));
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

  it('accepts a patch that applies cleanly and touches only the expected file', async () => {
    const patch = `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,3 +1,4 @@\n export function foo() {\n   return 1;\n }\n+export function bar() { return 2; }\n`;
    const result = await validatePatch(repoRoot, patch, 'src/foo.ts');
    expect(result.valid).toBe(true);
  });

  it('rejects a patch that does not apply cleanly against the current file content', async () => {
    const patch = `--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,3 +1,3 @@\n export function foo() {\n-  return 999;\n+  return 2;\n }\n`;
    const result = await validatePatch(repoRoot, patch, 'src/foo.ts');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not apply cleanly/);
  });

  it('rejects a patch touching a file other than the one the finding declared', async () => {
    writeFileSync(join(repoRoot, 'src', 'bar.ts'), 'export const x = 1;\n');
    const patch = `--- a/src/bar.ts\n+++ b/src/bar.ts\n@@ -1,1 +1,1 @@\n-export const x = 1;\n+export const x = 2;\n`;
    const result = await validatePatch(repoRoot, patch, 'src/foo.ts');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expected only/);
  });

  it('rejects a patch with a path-traversal target path', async () => {
    const patch = `--- a/../../etc/passwd\n+++ b/../../etc/passwd\n@@ -1,1 +1,1 @@\n-root:x:0:0\n+pwned:x:0:0\n`;
    const result = await validatePatch(repoRoot, patch, '../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/outside the repository root/);
  });

  it('rejects a patch targeting a denylisted path (.env)', async () => {
    writeFileSync(join(repoRoot, '.env'), 'SECRET=abc\n');
    const patch = `--- a/.env\n+++ b/.env\n@@ -1,1 +1,1 @@\n-SECRET=abc\n+SECRET=def\n`;
    const result = await validatePatch(repoRoot, patch, '.env');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/denylisted/);
  });

  it('rejects a patch targeting a GitHub workflow file', async () => {
    mkdirSync(join(repoRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
    const patch = `--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1,1 +1,1 @@\n-name: CI\n+name: Pwned\n`;
    const result = await validatePatch(repoRoot, patch, '.github/workflows/ci.yml');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/denylisted/);
  });

  it('rejects a patch whose resolved target escapes the repo root via a symlink', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'anubis-outside-'));
    writeFileSync(join(outsideDir, 'secret.ts'), 'export const secret = 1;\n');
    symlinkSync(outsideDir, join(repoRoot, 'escape-link'));

    const patch = `--- a/escape-link/secret.ts\n+++ b/escape-link/secret.ts\n@@ -1,1 +1,1 @@\n-export const secret = 1;\n+export const secret = 2;\n`;
    const result = await validatePatch(repoRoot, patch, 'escape-link/secret.ts');

    expect(result.valid).toBe(false);
    rmSync(outsideDir, { recursive: true, force: true });
  });
});
