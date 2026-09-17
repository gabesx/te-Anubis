import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { minimatch } from 'minimatch';
import { probeRepo, type RepoProbe } from '../repo/manifest-reader.js';
import type { Skill, SkillFrontmatter } from '../types/pipeline.js';

/** Alias kept for readability at call sites — detection just consumes the same repo probe. */
export type DetectionContext = RepoProbe;
export const buildDetectionContext = probeRepo;

function hasPackageDependency(context: DetectionContext, depName: string): boolean {
  if (!context.packageJson) return false;
  const deps = context.packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = context.packageJson.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.[depName]) || Boolean(devDeps?.[depName]);
}

type DetectionSignal = NonNullable<SkillFrontmatter['detectionSignals']>[number];

function matchesSignal(context: DetectionContext, signal: DetectionSignal): boolean {
  switch (signal.type) {
    case 'file-exists':
      return existsSync(join(context.repoRoot, signal.value));
    case 'file-glob':
      return context.repoFiles.some((f) => minimatch(f, signal.value));
    case 'package-dependency':
      return hasPackageDependency(context, signal.value);
    case 'config-key': {
      // Pragmatic textual search, not a real config parser: value is
      // "<configFileName>:<substring>". Acceptable heuristic gap for MVP —
      // it only inspects known config files at repo root (see plan risks).
      const [fileName, needle] = signal.value.split(':', 2);
      const content = fileName ? context.configFileContents[fileName] : undefined;
      if (!content || !needle) return false;
      return content.toLowerCase().includes(needle.toLowerCase());
    }
    default:
      return false;
  }
}

/**
 * A skill with no detection signals is never auto-detected — it only ever
 * activates via `skills.enabled` (e.g. code-convention, which the config
 * schema enables by default).
 *
 * Otherwise: every `required` signal must match, and if any `supporting`
 * (non-required) signals exist, at least one of those must also match. This
 * is what lets review-wdio-api-automation and review-wdio-apps-automation
 * both key off the same wdio.conf.* file without both firing on every WDIO
 * repo.
 */
export function matchesSkillDetection(skill: Skill, context: DetectionContext): boolean {
  const signals = skill.frontmatter.detectionSignals;
  if (!signals || signals.length === 0) return false;

  const required = signals.filter((s) => s.required);
  const supporting = signals.filter((s) => !s.required);

  if (!required.every((s) => matchesSignal(context, s))) return false;
  if (supporting.length === 0) return true;
  return supporting.some((s) => matchesSignal(context, s));
}
