import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSkillFile, loadSkillsFromDir } from '../../src/core/skills/skill-loader.js';
import { loadAllSkills } from '../../src/core/skills/skill-registry.js';
import { ConfigError } from '../../src/utils/errors.js';

describe('loadAllSkills (bundled)', () => {
  it('loads all four initial skills with valid frontmatter', () => {
    const skills = loadAllSkills(process.cwd());
    const ids = skills.map((s) => s.frontmatter.id).sort();
    expect(ids).toEqual(
      ['code-convention', 'review-wdio-api-automation', 'review-wdio-apps-automation', 'review-wdio-web-automation'].sort(),
    );
  });

  it('gives code-convention a broad file pattern and no detection signals', () => {
    const skills = loadAllSkills(process.cwd());
    const codeConvention = skills.find((s) => s.frontmatter.id === 'code-convention');
    expect(codeConvention?.frontmatter.detectionSignals).toBeUndefined();
    expect(codeConvention?.frontmatter.appliesTo.filePatterns.length).toBeGreaterThan(0);
  });
});

describe('loadSkillFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'anubis-skill-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a SKILL.md with invalid frontmatter', () => {
    const path = join(dir, 'SKILL.md');
    writeFileSync(
      path,
      `---
id: broken-skill
name: Broken
# missing required "version" and "appliesTo" fields
---
body content
`,
    );
    expect(() => loadSkillFile(path)).toThrow(ConfigError);
  });

  it('loads a repo-local skill directory the same way as bundled skills', () => {
    const skillDir = join(dir, 'my-custom-skill');
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
id: my-custom-skill
name: My Custom Skill
version: "1.0"
appliesTo:
  filePatterns:
    - "**/*.ts"
autoFixable: false
---
Custom skill body.
`,
    );
    const skills = loadSkillsFromDir(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.frontmatter.id).toBe('my-custom-skill');
    expect(skills[0]?.content).toBe('Custom skill body.');
  });
});
