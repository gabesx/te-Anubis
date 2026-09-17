import { minimatch } from 'minimatch';
import type { ChangedFile } from '../types/context.js';
import type { ResolvedSkill, Skill } from '../types/pipeline.js';
import { matchesSkillDetection, type DetectionContext } from './detector.js';

export interface ResolveSkillsOptions {
  autoDetect: boolean;
  enabled: string[];
  detectionContext: DetectionContext;
}

/**
 * Manual (`skills.enabled` — CLI `--skill` flags and/or `.anubis.yml`) is
 * unioned with auto-detected skills by default (extends); `autoDetect: false`
 * makes the manual list authoritative (overrides).
 */
export function resolveSkills(allSkills: Skill[], changedFiles: ChangedFile[], options: ResolveSkillsOptions): ResolvedSkill[] {
  const detectedIds = options.autoDetect
    ? new Set(allSkills.filter((s) => matchesSkillDetection(s, options.detectionContext)).map((s) => s.frontmatter.id))
    : new Set<string>();

  const enabledIds = new Set(options.enabled);
  const activeIds = options.autoDetect ? new Set([...detectedIds, ...enabledIds]) : enabledIds;

  const resolved: ResolvedSkill[] = [];
  for (const skill of allSkills) {
    if (!activeIds.has(skill.frontmatter.id)) continue;

    const matchedFiles = changedFiles
      .filter((f) => skill.frontmatter.appliesTo.filePatterns.some((pattern) => minimatch(f.path, pattern)))
      .map((f) => f.path);

    resolved.push({
      ...skill,
      matchedFiles,
      triggeredBy: detectedIds.has(skill.frontmatter.id) ? 'auto-detect' : 'manual',
    });
  }
  return resolved;
}
