import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDetectionContext, matchesSkillDetection } from '../../src/core/skills/detector.js';
import { loadAllSkills } from '../../src/core/skills/skill-registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '../fixtures/repos');

function findSkill(repoRoot: string, id: string) {
  const skill = loadAllSkills(repoRoot).find((s) => s.frontmatter.id === id);
  if (!skill) throw new Error(`fixture setup error: skill "${id}" not found`);
  return skill;
}

describe('matchesSkillDetection', () => {
  it('activates review-wdio-api-automation for a WDIO project with an HTTP client dependency', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-api-project');
    const context = buildDetectionContext(repoRoot);
    const skill = findSkill(repoRoot, 'review-wdio-api-automation');
    expect(matchesSkillDetection(skill, context)).toBe(true);
  });

  it('does not activate review-wdio-apps-automation for the API project (no appium dependency)', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-api-project');
    const context = buildDetectionContext(repoRoot);
    const skill = findSkill(repoRoot, 'review-wdio-apps-automation');
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });

  it('activates review-wdio-apps-automation for a WDIO project with @wdio/appium-service', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-apps-project');
    const context = buildDetectionContext(repoRoot);
    const skill = findSkill(repoRoot, 'review-wdio-apps-automation');
    expect(matchesSkillDetection(skill, context)).toBe(true);
  });

  it('does not activate review-wdio-api-automation for the apps project (no HTTP client dependency)', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-apps-project');
    const context = buildDetectionContext(repoRoot);
    const skill = findSkill(repoRoot, 'review-wdio-api-automation');
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });

  it('activates review-wdio-web-automation for a WDIO project with page objects and @wdio/browser-runner', () => {
    const repoRoot = join(FIXTURES, 'sample-wdio-web-project');
    const context = buildDetectionContext(repoRoot);
    const skill = findSkill(repoRoot, 'review-wdio-web-automation');
    expect(matchesSkillDetection(skill, context)).toBe(true);
  });

  it('does not activate any WDIO skill for a plain TypeScript project with no wdio.conf.*', () => {
    const repoRoot = join(FIXTURES, 'sample-generic-ts-project');
    const context = buildDetectionContext(repoRoot);
    for (const id of ['review-wdio-api-automation', 'review-wdio-apps-automation', 'review-wdio-web-automation']) {
      expect(matchesSkillDetection(findSkill(repoRoot, id), context)).toBe(false);
    }
  });

  it('never auto-detects code-convention (it has no detection signals)', () => {
    const repoRoot = join(FIXTURES, 'sample-generic-ts-project');
    const context = buildDetectionContext(repoRoot);
    expect(matchesSkillDetection(findSkill(repoRoot, 'code-convention'), context)).toBe(false);
  });
});
