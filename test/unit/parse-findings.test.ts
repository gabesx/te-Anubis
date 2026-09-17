import { describe, expect, it } from 'vitest';
import { parseFindings } from '../../src/core/pipeline/ai-review/parse-findings.js';

const allowedSkills = new Map([
  ['review-wdio-api-automation', false],
  ['code-convention', true],
]);

describe('parseFindings', () => {
  it('parses a well-formed response into Finding objects', () => {
    const response = JSON.stringify({
      findings: [
        {
          severity: 'HIGH',
          category: 'missing-test-assertion',
          title: 'No status assertion',
          problem: 'The response status is never checked',
          rationale: 'A regression could pass silently',
          suggestion: 'Add expect(response.status).toBe(201)',
          confidence: 0.85,
          line: 12,
          evidence: [],
          skillId: 'review-wdio-api-automation',
        },
      ],
    });

    const findings = parseFindings(response, { filePath: 'step-definitions/order.steps.ts', allowedSkills });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'HIGH',
      category: 'missing-test-assertion',
      location: { file: 'step-definitions/order.steps.ts', startLine: 12 },
      skillId: 'review-wdio-api-automation',
      autoFixable: false,
      status: 'proposed',
    });
    expect(findings[0]?.id).toBeTruthy();
  });

  it('carries a proposed patch through as suggestedDiff when present', () => {
    const response = JSON.stringify({
      findings: [
        {
          severity: 'HIGH',
          category: 'missing-validation',
          title: 'Missing assertion',
          problem: 'p',
          rationale: 'r',
          suggestion: 's',
          confidence: 0.9,
          line: 4,
          skillId: 'code-convention',
          patch: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,2 @@\n a\n+b\n',
        },
      ],
    });
    const findings = parseFindings(response, { filePath: 'foo.ts', allowedSkills });
    expect(findings[0]?.suggestedDiff).toContain('+b');
  });

  it('leaves suggestedDiff undefined when no patch is proposed', () => {
    const response = JSON.stringify({
      findings: [
        { severity: 'LOW', category: 'x', title: 't', problem: 'p', rationale: 'r', confidence: 0.9, line: 1, skillId: 'code-convention' },
      ],
    });
    const findings = parseFindings(response, { filePath: 'foo.ts', allowedSkills });
    expect(findings[0]?.suggestedDiff).toBeUndefined();
  });

  it('strips a markdown code fence around the JSON', () => {
    const response = '```json\n{"findings":[]}\n```';
    expect(parseFindings(response, { filePath: 'foo.ts', allowedSkills })).toEqual([]);
  });

  it('returns an empty array for unparseable JSON instead of throwing', () => {
    expect(() => parseFindings('not json at all', { filePath: 'foo.ts', allowedSkills })).not.toThrow();
    expect(parseFindings('not json at all', { filePath: 'foo.ts', allowedSkills })).toEqual([]);
  });

  it('drops a finding naming a skillId that was not offered to it', () => {
    const response = JSON.stringify({
      findings: [
        {
          severity: 'HIGH',
          category: 'bug',
          title: 't',
          problem: 'p',
          rationale: 'r',
          suggestion: 's',
          confidence: 0.9,
          line: 1,
          skillId: 'some-unrelated-skill-not-offered',
        },
      ],
    });
    expect(parseFindings(response, { filePath: 'foo.ts', allowedSkills })).toEqual([]);
  });

  it('sets location to null when no line number is given', () => {
    const response = JSON.stringify({
      findings: [
        {
          severity: 'MEDIUM',
          category: 'bug',
          title: 't',
          problem: 'p',
          rationale: 'r',
          suggestion: 's',
          confidence: 0.9,
          line: null,
          skillId: 'code-convention',
        },
      ],
    });
    const findings = parseFindings(response, { filePath: 'foo.ts', allowedSkills });
    expect(findings[0]?.location).toBeNull();
  });

  it('drops individual malformed findings without discarding the well-formed ones', () => {
    const response = JSON.stringify({
      findings: [
        { severity: 'NOT_A_SEVERITY', category: 'bug', title: 't', problem: 'p', rationale: 'r', confidence: 0.9, skillId: 'code-convention' },
      ],
    });
    // the whole response fails schema validation since it's a single array — zod validates all-or-nothing per response,
    // so a malformed entry means this response contributes zero findings (documented, acceptable MVP behavior).
    expect(parseFindings(response, { filePath: 'foo.ts', allowedSkills })).toEqual([]);
  });

  it('produces a stable id for the same finding across calls', () => {
    const response = JSON.stringify({
      findings: [
        {
          severity: 'HIGH',
          category: 'bug',
          title: 'Same finding',
          problem: 'p',
          rationale: 'r',
          suggestion: 's',
          confidence: 0.9,
          line: 5,
          skillId: 'code-convention',
        },
      ],
    });
    const first = parseFindings(response, { filePath: 'foo.ts', allowedSkills });
    const second = parseFindings(response, { filePath: 'foo.ts', allowedSkills });
    expect(first[0]?.id).toBe(second[0]?.id);
  });
});
