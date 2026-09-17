import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDetectionContext, matchesSkillDetection, type DetectionContext } from '../../src/core/skills/detector.js';
import { loadAllSkills } from '../../src/core/skills/skill-registry.js';
import type { Skill } from '../../src/core/types/pipeline.js';

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

function makeSkill(detectionSignals: NonNullable<Skill['frontmatter']['detectionSignals']>): Skill {
  return {
    frontmatter: { id: 'synthetic', name: 'synthetic', version: '1.0', appliesTo: { filePatterns: ['**/*'] }, detectionSignals, autoFixable: false },
    content: '',
    path: '/fake/synthetic/SKILL.md',
  };
}

describe('matchesSkillDetection — file-exists and config-key signal types', () => {
  const repoRoot = join(FIXTURES, 'sample-wdio-api-project');
  const context: DetectionContext = buildDetectionContext(repoRoot);

  it('matches a file-exists signal for a file that is present', () => {
    const skill = makeSkill([{ type: 'file-exists', value: 'wdio.conf.ts', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(true);
  });

  it('does not match a file-exists signal for a file that is absent', () => {
    const skill = makeSkill([{ type: 'file-exists', value: 'does-not-exist.txt', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });

  it('matches a config-key signal when the named config file contains the substring (case-insensitive)', () => {
    const skill = makeSkill([{ type: 'config-key', value: 'wdio.conf.ts:CUCUMBER', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(true);
  });

  it('does not match a config-key signal when the substring is absent', () => {
    const skill = makeSkill([{ type: 'config-key', value: 'wdio.conf.ts:appium', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });

  it('does not match a config-key signal for a config file that was not captured at all', () => {
    const skill = makeSkill([{ type: 'config-key', value: 'nonexistent.conf.js:anything', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });

  it('does not match a malformed config-key signal with no ":" separator', () => {
    const skill = makeSkill([{ type: 'config-key', value: 'justafilename', required: true }]);
    expect(matchesSkillDetection(skill, context)).toBe(false);
  });
});
