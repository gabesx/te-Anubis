import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../utils/errors.js';
import type { Skill } from '../types/pipeline.js';
import { loadSkillsFromDir } from './skill-loader.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The bundled `skills/` directory sits at the package root, but this module's
 * own location relative to that root differs between dev (tsx running
 * src/core/skills/*.ts) and the built CLI (tsup bundles everything into a
 * single dist/cli/index.js). Rather than hardcode a depth that only works for
 * one of those, try both and use whichever actually exists.
 */
function resolveBundledSkillsDir(): string {
  const candidates = [
    join(here, '../../../skills'), // src/core/skills -> package root -> skills/
    join(here, '../../skills'), // dist/cli -> package root -> skills/
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new ConfigError(`Could not locate the bundled skills/ directory (looked near ${here}).`);
  }
  return found;
}

/** Repo-local skills override bundled ones with the same id. */
export function loadAllSkills(repoRoot: string): Skill[] {
  const bundled = loadSkillsFromDir(resolveBundledSkillsDir());
  const repoLocal = loadSkillsFromDir(join(repoRoot, '.anubis/skills'));

  const byId = new Map<string, Skill>();
  for (const skill of [...bundled, ...repoLocal]) {
    byId.set(skill.frontmatter.id, skill);
  }
  return [...byId.values()];
}
