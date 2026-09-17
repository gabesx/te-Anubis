import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { probeRepo, readRepoManifest } from '../../src/core/repo/manifest-reader.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '../fixtures/repos');

describe('readRepoManifest', () => {
  it('tags an API-automation fixture with the wdio and cucumber-adjacent frameworks it depends on', () => {
    const manifest = readRepoManifest(join(FIXTURES, 'sample-wdio-api-project'));
    expect(manifest.frameworks).toContain('wdio');
    expect(manifest.raw.wdioConfigPresent).toBe(true);
  });

  it('tags an apps-automation fixture with the appium framework', () => {
    const manifest = readRepoManifest(join(FIXTURES, 'sample-wdio-apps-project'));
    expect(manifest.frameworks).toContain('appium');
  });

  it('does not tag a plain TS project with any WDIO-related framework', () => {
    const manifest = readRepoManifest(join(FIXTURES, 'sample-generic-ts-project'));
    expect(manifest.frameworks).not.toContain('wdio');
    expect(manifest.frameworks).not.toContain('appium');
    expect(manifest.raw.wdioConfigPresent).toBe(false);
  });

  it('reuses an externally-built probe instead of re-walking the filesystem', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-web-project');
    const probe = probeRepo(repoRoot);
    const manifest = readRepoManifest(repoRoot, probe);
    expect(manifest.frameworks).toContain('wdio');
  });
});

describe('probeRepo', () => {
  it('lists repo-relative file paths, excluding ignored directories', () => {
    const probe = probeRepo(join(FIXTURES, 'sample-wdio-web-project'));
    expect(probe.repoFiles).toContain('wdio.conf.ts');
    expect(probe.repoFiles).toContain('pageobjects/login.page.ts');
    expect(probe.repoFiles.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('parses package.json when present', () => {
    const probe = probeRepo(join(FIXTURES, 'sample-wdio-api-project'));
    expect(probe.packageJson?.name).toBe('sample-wdio-api-project');
  });

  it('returns a null packageJson for a directory without one', () => {
    const probe = probeRepo(join(FIXTURES, 'sample-wdio-api-project', 'step-definitions'));
    expect(probe.packageJson).toBeNull();
  });
});
