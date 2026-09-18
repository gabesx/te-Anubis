import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/cli/config/load-config.js';
import { ConfigError } from '../../src/utils/errors.js';

const PROVIDER_ENV_VARS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];

describe('loadConfig', () => {
  let repoRoot: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-config-test-'));
    // Provider auto-detection reads real env vars, and the ambient shell running these tests
    // may itself have one of these set (e.g. a developer's own GEMINI_API_KEY) — tests must not
    // depend on that. Clear all three here; individual tests set back whichever they need.
    for (const key of PROVIDER_ENV_VARS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    for (const key of PROVIDER_ENV_VARS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('returns schema defaults when no .anubis.yml exists', () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key';
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

  describe('ai.provider: "auto" resolution', () => {
    it('is the default when nothing is configured', () => {
      process.env.ANTHROPIC_API_KEY = 'fake-key';
      // No explicit provider anywhere — the schema default is "auto", resolved against env vars.
      const config = loadConfig(repoRoot);
      expect(config.ai.provider).toBe('anthropic');
    });

    it('picks gemini first when multiple provider keys are set', () => {
      process.env.GEMINI_API_KEY = 'fake-gemini-key';
      process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key';
      process.env.OPENAI_API_KEY = 'fake-openai-key';
      const config = loadConfig(repoRoot);
      expect(config.ai.provider).toBe('gemini');
    });

    it('falls back to anthropic when gemini is not set but anthropic is', () => {
      process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key';
      const config = loadConfig(repoRoot);
      expect(config.ai.provider).toBe('anthropic');
    });

    it('falls back to openai when only openai is set', () => {
      process.env.OPENAI_API_KEY = 'fake-openai-key';
      const config = loadConfig(repoRoot);
      expect(config.ai.provider).toBe('openai');
    });

    it('throws a clear ConfigError when auto-detection finds no provider key at all', () => {
      expect(() => loadConfig(repoRoot)).toThrow(ConfigError);
      expect(() => loadConfig(repoRoot)).toThrow(/no provider API key is set/);
    });

    it('an explicit .anubis.yml provider always wins over auto-detection, even if a different key is set', () => {
      process.env.GEMINI_API_KEY = 'fake-gemini-key';
      writeFileSync(join(repoRoot, '.anubis.yml'), 'ai:\n  provider: openai\n');
      process.env.OPENAI_API_KEY = 'fake-openai-key';

      const config = loadConfig(repoRoot);
      expect(config.ai.provider).toBe('openai');
    });

    it('an explicit --provider auto CLI override re-triggers auto-detection even if .anubis.yml pins a provider', () => {
      process.env.GEMINI_API_KEY = 'fake-gemini-key';
      writeFileSync(join(repoRoot, '.anubis.yml'), 'ai:\n  provider: openai\n');

      const config = loadConfig(repoRoot, { provider: 'auto' });
      expect(config.ai.provider).toBe('gemini');
    });
  });
});
