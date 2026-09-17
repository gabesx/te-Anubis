import { describe, expect, it } from 'vitest';
import { deduplicateFindings } from '../../src/core/validation/dedup.js';
import type { Finding } from '../../src/core/types/finding.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'id-1',
    severity: 'HIGH',
    category: 'bug',
    location: { file: 'src/foo.ts', startLine: 10 },
    title: 'Missing status assertion',
    problem: 'The response status is never checked',
    rationale: 'A regression could pass silently',
    suggestion: 'Add an assertion',
    confidence: 0.8,
    skillId: 'review-wdio-api-automation',
    autoFixable: false,
    status: 'validated',
    ...overrides,
  };
}

describe('deduplicateFindings', () => {
  it('merges exact-ID collisions, keeping the higher-confidence one', () => {
    const findings = [makeFinding({ id: 'same', confidence: 0.6 }), makeFinding({ id: 'same', confidence: 0.9 })];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.9);
  });

  it('merges near-duplicates on the same file and nearby line with similar wording', () => {
    const findings = [
      makeFinding({ id: 'a', location: { file: 'src/foo.ts', startLine: 10 }, problem: 'The response status is never checked', confidence: 0.7 }),
      makeFinding({
        id: 'b',
        location: { file: 'src/foo.ts', startLine: 11 },
        problem: 'The response status code is never checked here',
        confidence: 0.85,
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.85);
  });

  it('keeps two findings on the same file/line with unrelated wording (not a duplicate)', () => {
    const findings = [
      makeFinding({ id: 'a', location: { file: 'src/foo.ts', startLine: 10 }, problem: 'The response status is never checked' }),
      makeFinding({ id: 'b', location: { file: 'src/foo.ts', startLine: 10 }, problem: 'Shared mutable state creates test-order dependency' }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('keeps two similar findings on unrelated lines (too far apart to be a duplicate)', () => {
    const findings = [
      makeFinding({ id: 'a', location: { file: 'src/foo.ts', startLine: 10 }, problem: 'The response status is never checked' }),
      makeFinding({ id: 'b', location: { file: 'src/foo.ts', startLine: 90 }, problem: 'The response status is never checked' }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('never treats repo-level (null-location) findings as duplicates of each other', () => {
    const findings = [
      makeFinding({ id: 'a', location: null, problem: 'Shared config drift across environments' }),
      makeFinding({ id: 'b', location: null, problem: 'Shared config drift across environments' }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });
});
