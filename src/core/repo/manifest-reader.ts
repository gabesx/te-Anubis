import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import type { RepoManifestInfo } from '../types/context.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.anubis']);
const KNOWN_CONFIG_FILES = [
  'wdio.conf.ts',
  'wdio.conf.js',
  'package.json',
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc.json',
  '.eslintrc.js',
];
const MAX_WALK_DEPTH = 6;

export interface RepoProbe {
  repoRoot: string;
  packageJson: Record<string, unknown> | null;
  /** Raw content of a small set of well-known config files, keyed by filename (repo-root only). */
  configFileContents: Record<string, string>;
  /** Repo-relative file paths, used for glob-based signals. */
  repoFiles: string[];
}

function listFilesRecursive(root: string, dir = root, depth = 0): string[] {
  if (depth > MAX_WALK_DEPTH) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(root, fullPath, depth + 1));
    } else if (entry.isFile()) {
      files.push(relative(root, fullPath));
    }
  }
  return files;
}

/**
 * Single filesystem probe of a repo, reused by both skill auto-detection
 * (core/skills/detector.ts) and manifest reading below — avoids walking the
 * repo tree twice for what is conceptually the same "what's actually in this
 * repo" question.
 */
export function probeRepo(repoRoot: string): RepoProbe {
  const repoFiles = listFilesRecursive(repoRoot);

  const packageJsonPath = join(repoRoot, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>)
    : null;

  const configFileContents: Record<string, string> = {};
  for (const name of KNOWN_CONFIG_FILES) {
    const path = join(repoRoot, name);
    if (existsSync(path)) {
      configFileContents[name] = readFileSync(path, 'utf-8');
    }
  }

  return { repoRoot, packageJson, configFileContents, repoFiles };
}

function hasDependency(probe: RepoProbe, name: string): boolean {
  if (!probe.packageJson) return false;
  const deps = probe.packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = probe.packageJson.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.[name]) || Boolean(devDeps?.[name]);
}

const FRAMEWORK_DEP_TAGS: { tag: string; deps: string[] }[] = [
  { tag: 'wdio', deps: ['webdriverio', '@wdio/cli'] },
  { tag: 'appium', deps: ['appium', '@wdio/appium-service'] },
  { tag: 'cucumber', deps: ['@wdio/cucumber-framework', '@cucumber/cucumber'] },
  { tag: 'mocha', deps: ['@wdio/mocha-framework', 'mocha'] },
  { tag: 'jest', deps: ['jest', 'ts-jest'] },
  { tag: 'typescript', deps: ['typescript'] },
];

/**
 * Filtered to what's relevant, not a raw dump: `frameworks` are coarse tags a
 * skill/prompt can key off, and `raw` only carries the small set of facts the
 * Context Engine actually uses (not, say, every field of package.json).
 */
export function readRepoManifest(repoRoot: string, probe: RepoProbe = probeRepo(repoRoot)): RepoManifestInfo {
  const frameworks = FRAMEWORK_DEP_TAGS.filter(({ deps }) => deps.some((d) => hasDependency(probe, d))).map(({ tag }) => tag);

  return {
    frameworks,
    raw: {
      name: probe.packageJson?.name,
      hasTypescriptConfig: Boolean(probe.configFileContents['tsconfig.json']),
      hasEslintConfig: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.js'].some(
        (f) => probe.configFileContents[f] !== undefined,
      ),
      wdioConfigPresent: Boolean(probe.configFileContents['wdio.conf.ts'] ?? probe.configFileContents['wdio.conf.js']),
    },
  };
}
