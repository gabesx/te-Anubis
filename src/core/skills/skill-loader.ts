import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { ConfigError } from '../../utils/errors.js';
import type { Skill } from '../types/pipeline.js';

const SeveritySchema = z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'SUGGESTION']);

const DetectionSignalSchema = z.object({
  type: z.enum(['file-exists', 'file-glob', 'package-dependency', 'config-key']),
  value: z.string(),
  required: z.boolean().optional(),
});

const SkillFrontmatterSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  appliesTo: z.object({
    filePatterns: z.array(z.string()),
    frameworks: z.array(z.string()).optional(),
  }),
  detectionSignals: z.array(DetectionSignalSchema).optional(),
  defaultSeverityBias: z.record(z.string(), SeveritySchema).optional(),
  autoFixable: z.boolean().default(false),
});

export function loadSkillFile(path: string): Skill {
  const raw = readFileSync(path, 'utf-8');
  const parsed = matter(raw);
  const result = SkillFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    throw new ConfigError(`Invalid SKILL.md frontmatter at ${path}: ${result.error.message}`);
  }
  return { frontmatter: result.data, content: parsed.content.trim(), path };
}

/** Loads every `<dir>/<skill-id>/SKILL.md` found directly under `dir`. Missing dir => no skills, not an error. */
export function loadSkillsFromDir(dir: string): Skill[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (existsSync(skillFile)) {
      skills.push(loadSkillFile(skillFile));
    }
  }
  return skills;
}
