import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { ConfigError } from '../../utils/errors.js';
import type { AnubisConfig } from '../../core/types/config.js';
import { AnubisConfigFileSchema, type AnubisConfigFile, type AnubisConfigFileInput } from './schema.js';

export interface CliOverrides {
  provider?: 'anthropic' | 'openai' | 'gemini';
  skills?: string[];
  /** Forces `skills.auto_detect` off — used by `/anubis review <skill>` to scope strictly to that skill
   * rather than the usual union-with-auto-detected-skills behavior. */
  autoDetect?: boolean;
  configPath?: string;
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = result[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function readYamlConfig(repoRoot: string, configPath?: string): AnubisConfigFileInput {
  const path = configPath ?? join(repoRoot, '.anubis.yml');
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw);
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`Invalid .anubis.yml at ${path}: expected a YAML mapping at the top level.`);
  }
  return parsed as AnubisConfigFileInput;
}

/** Maps the on-disk snake_case file shape to core's camelCase runtime shape. */
function toCoreConfig(file: AnubisConfigFile): AnubisConfig {
  return {
    version: file.version,
    ai: { provider: file.ai.provider, model: file.ai.model },
    review: {
      minimumConfidence: file.review.minimum_confidence,
      maxComments: file.review.max_comments,
      maxFiles: file.review.max_files,
    },
    skills: {
      autoDetect: file.skills.auto_detect,
      enabled: file.skills.enabled,
    },
    github: {
      inlineComments: file.github.inline_comments,
      summary: file.github.summary,
    },
    fix: {
      enabled: file.fix.enabled,
      autoCommit: file.fix.auto_commit,
      allowed: file.fix.allowed,
    },
  };
}

/**
 * Precedence: CLI flags > .anubis.yml > schema defaults.
 */
export function loadConfig(repoRoot: string, overrides: CliOverrides = {}): AnubisConfig {
  const fileConfig = readYamlConfig(repoRoot, overrides.configPath);

  const cliConfig: AnubisConfigFileInput = {};
  if (overrides.provider) {
    cliConfig.ai = { provider: overrides.provider };
  }
  if (overrides.skills && overrides.skills.length > 0) {
    cliConfig.skills = { enabled: overrides.skills };
  }
  if (overrides.autoDetect !== undefined) {
    cliConfig.skills = { ...cliConfig.skills, auto_detect: overrides.autoDetect };
  }

  const merged = deepMerge(fileConfig as Record<string, unknown>, cliConfig as Record<string, unknown>);

  const result = AnubisConfigFileSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigError(`Invalid Anubis configuration: ${result.error.message}`);
  }
  return toCoreConfig(result.data);
}
