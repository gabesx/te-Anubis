import { describe, expect, it } from 'vitest';
import { applySeverityClassification, classifySeverity } from '../../src/core/validation/severity-engine.js';
import type { Finding } from '../../src/core/types/finding.js';
import type { ResolvedSkill } from '../../src/core/types/pipeline.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'id',
    severity: 'LOW',
    category: 'security',
    location: { file: 'src/foo.ts', startLine: 1 },
    title: 't',
    problem: 'p',
    rationale: 'r',
    suggestion: 's',
    confidence: 0.9,
    skillId: 'code-convention',
    autoFixable: false,
    status: 'validated',
    ...overrides,
  };
}

function makeSkill(id: string, defaultSeverityBias?: Record<string, Finding['severity']>): ResolvedSkill {
  return {
    frontmatter: {
      id,
      name: id,
      version: '1.0',
      appliesTo: { filePatterns: ['**/*.ts'] },
      defaultSeverityBias,
      autoFixable: false,
    },
    content: '',
    path: '',
    matchedFiles: [],
    triggeredBy: 'manual',
  };
}

describe('classifySeverity', () => {
  it('applies the built-in default for a known category when the skill has no bias', () => {
    const finding = makeFinding({ category: 'security', severity: 'LOW' });
    const skillsById = new Map([['code-convention', makeSkill('code-convention')]]);
    expect(classifySeverity(finding, skillsById)).toBe('BLOCKER');
  });

  it("prefers the skill's own severity bias over the built-in default", () => {
    const finding = makeFinding({ category: 'security', severity: 'LOW', skillId: 'custom-skill' });
    const skillsById = new Map([['custom-skill', makeSkill('custom-skill', { security: 'MEDIUM' })]]);
    expect(classifySeverity(finding, skillsById)).toBe('MEDIUM');
  });

  it("leaves the AI's original severity untouched when neither table has an opinion", () => {
    const finding = makeFinding({ category: 'some-novel-category', severity: 'SUGGESTION' });
    const skillsById = new Map([['code-convention', makeSkill('code-convention')]]);
    expect(classifySeverity(finding, skillsById)).toBe('SUGGESTION');
  });
});

describe('applySeverityClassification', () => {
  it('reclassifies every finding in the list', () => {
    const findings = [makeFinding({ category: 'security', severity: 'LOW' }), makeFinding({ category: 'weak-assertion', severity: 'HIGH' })];
    const skills = [makeSkill('code-convention')];
    const result = applySeverityClassification(findings, skills);
    expect(result[0]?.severity).toBe('BLOCKER');
    expect(result[1]?.severity).toBe('LOW');
  });
});
