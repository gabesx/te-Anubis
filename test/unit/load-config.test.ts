import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/cli/config/load-config.js';
import { ConfigError } from '../../src/utils/errors.js';

describe('loadConfig', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-config-test-'));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('returns schema defaults when no .anubis.yml exists', () => {
    const config = loadConfig(repoRoot);
    expect(config.ai.provider).toBe('anthropic');
    expect(config.review.minimumConfidence).toBe(0.7);
    expect(config.review.maxFiles).toBe(50);
    expect(config.skills.autoDetect).toBe(true);
    expect(config.fix.enabled).toBe(false);
  });

  it('maps snake_case .anubis.yml keys to camelCase runtime config', () => {
    writeFileSync(
      join(repoRoot, '.anubis.yml'),
      `
version: 1
ai:
  provider: openai
review:
  minimum_confidence: 0.9
  max_comments: 5
  max_files: 10
skills:
  auto_detect: false
  enabled:
    - code-convention
    - review-wdio-api-automation
fix:
  enabled: true
  auto_commit: true
  allowed:
    - SAFE
    - REVIEW_REQUIRED
`,
    );

    const config = loadConfig(repoRoot);
    expect(config.ai.provider).toBe('openai');
    expect(config.review.minimumConfidence).toBe(0.9);
    expect(config.review.maxComments).toBe(5);
    expect(config.review.maxFiles).toBe(10);
    expect(config.skills.autoDetect).toBe(false);
    expect(config.skills.enabled).toEqual(['code-convention', 'review-wdio-api-automation']);
    expect(config.fix.enabled).toBe(true);
    expect(config.fix.autoCommit).toBe(true);
    expect(config.fix.allowed).toEqual(['SAFE', 'REVIEW_REQUIRED']);
  });

  it('CLI overrides take precedence over .anubis.yml', () => {
    writeFileSync(
      join(repoRoot, '.anubis.yml'),
      `
ai:
  provider: openai
skills:
  enabled:
    - code-convention
`,
    );

    const config = loadConfig(repoRoot, { provider: 'gemini', skills: ['review-wdio-web-automation'] });
    expect(config.ai.provider).toBe('gemini');
    expect(config.skills.enabled).toEqual(['review-wdio-web-automation']);
  });

  it('rejects a .anubis.yml whose top level is not a mapping', () => {
    writeFileSync(join(repoRoot, '.anubis.yml'), '- just\n- a\n- list\n');
    expect(() => loadConfig(repoRoot)).toThrow(ConfigError);
  });

  it('rejects an invalid ai.provider value', () => {
    writeFileSync(join(repoRoot, '.anubis.yml'), 'ai:\n  provider: not-a-real-provider\n');
    expect(() => loadConfig(repoRoot)).toThrow(ConfigError);
  });
});
