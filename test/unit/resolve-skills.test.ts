import { describe, expect, it } from 'vitest';
import { resolveSkills } from '../../src/core/skills/resolve.js';
import type { DetectionContext } from '../../src/core/skills/detector.js';
import type { ChangedFile } from '../../src/core/types/context.js';
import type { Skill } from '../../src/core/types/pipeline.js';

function makeSkill(id: string, opts: { detectable?: boolean; filePatterns?: string[] } = {}): Skill {
  return {
    frontmatter: {
      id,
      name: id,
      version: '1.0',
      appliesTo: { filePatterns: opts.filePatterns ?? [`**/${id}/**`] },
      detectionSignals: opts.detectable ? [{ type: 'file-glob', value: 'marker.txt', required: true }] : undefined,
      autoFixable: false,
    },
    content: '',
    path: `/fake/${id}/SKILL.md`,
  };
}

const emptyDetectionContext: DetectionContext = {
  repoRoot: '/fake',
  packageJson: null,
  configFileContents: {},
  repoFiles: ['marker.txt'], // present, so file-exists-based detection signals match
};

const noChangedFiles: ChangedFile[] = [];

describe('resolveSkills', () => {
  it('auto-detects a skill with matching signals when autoDetect is true', () => {
    const skills = [makeSkill('auto-detectable', { detectable: true })];
    const resolved = resolveSkills(skills, noChangedFiles, {
      autoDetect: true,
      enabled: [],
      detectionContext: emptyDetectionContext,
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.triggeredBy).toBe('auto-detect');
  });

  it('unions manual skills.enabled with auto-detected skills by default', () => {
    const skills = [makeSkill('auto-detectable', { detectable: true }), makeSkill('code-convention')];
    const resolved = resolveSkills(skills, noChangedFiles, {
      autoDetect: true,
      enabled: ['code-convention'],
      detectionContext: emptyDetectionContext,
    });
    const ids = resolved.map((s) => s.frontmatter.id).sort();
    expect(ids).toEqual(['auto-detectable', 'code-convention']);
  });

  it('does not activate a detectable skill that is neither detected nor manually enabled', () => {
    const skills = [makeSkill('never-detected', { detectable: true })];
    const contextWithoutMarker: DetectionContext = { ...emptyDetectionContext, repoFiles: [] };
    const resolved = resolveSkills(skills, noChangedFiles, {
      autoDetect: true,
      enabled: [],
      detectionContext: contextWithoutMarker,
    });
    expect(resolved).toHaveLength(0);
  });

  it('autoDetect: false makes the manual list authoritative (overrides, does not union)', () => {
    const skills = [makeSkill('auto-detectable', { detectable: true }), makeSkill('code-convention')];
    const resolved = resolveSkills(skills, noChangedFiles, {
      autoDetect: false,
      enabled: ['code-convention'],
      detectionContext: emptyDetectionContext, // would auto-detect "auto-detectable" if autoDetect were true
    });
    const ids = resolved.map((s) => s.frontmatter.id);
    expect(ids).toEqual(['code-convention']);
  });

  it('computes matchedFiles by glob-matching appliesTo.filePatterns against changed files', () => {
    const skills = [makeSkill('wdio-api', { filePatterns: ['**/step-definitions/**'] })];
    const changedFiles: ChangedFile[] = [
      { path: 'step-definitions/order.steps.ts', changeType: 'modified', hunks: [], language: 'typescript', classification: 'test' },
      { path: 'src/unrelated.ts', changeType: 'modified', hunks: [], language: 'typescript', classification: 'source' },
    ];
    const resolved = resolveSkills(skills, changedFiles, {
      autoDetect: false,
      enabled: ['wdio-api'],
      detectionContext: emptyDetectionContext,
    });
    expect(resolved[0]?.matchedFiles).toEqual(['step-definitions/order.steps.ts']);
  });
});
