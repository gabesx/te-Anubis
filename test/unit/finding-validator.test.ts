import { describe, expect, it } from 'vitest';
import { validateFindings } from '../../src/core/validation/finding-validator.js';
import type { ChangedFile } from '../../src/core/types/context.js';
import type { Finding } from '../../src/core/types/finding.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-id',
    severity: 'HIGH',
    category: 'bug',
    location: { file: 'src/foo.ts', startLine: 10 },
    title: 'Something is wrong',
    problem: 'The thing is broken',
    rationale: 'It matters because X',
    suggestion: 'Fix it by doing Y',
    confidence: 0.9,
    skillId: 'code-convention',
    autoFixable: false,
    status: 'proposed',
    ...overrides,
  };
}

const changedFile: ChangedFile = {
  path: 'src/foo.ts',
  changeType: 'modified',
  hunks: [{ startLine: 8, endLine: 15, content: 'hunk content' }],
  language: 'typescript',
  classification: 'source',
};

function validate(finding: Finding, opts: Partial<Parameters<typeof validateFindings>[1]> = {}) {
  return validateFindings([finding], {
    changedFilesByPath: new Map([['src/foo.ts', changedFile]]),
    lintIssues: [],
    minimumConfidence: 0.7,
    ...opts,
  })[0]!;
}

describe('validateFindings — location gate', () => {
  it('accepts a finding whose line falls within a diff hunk', () => {
    const result = validate(makeFinding({ location: { file: 'src/foo.ts', startLine: 10 } }));
    expect(result.status).toBe('validated');
  });

  it('rejects a finding whose line falls outside every diff hunk with no evidence', () => {
    const result = validate(makeFinding({ location: { file: 'src/foo.ts', startLine: 200 }, evidence: undefined }));
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/not grounded/);
  });

  it('accepts a finding outside the diff hunk range when it cites evidence', () => {
    const result = validate(makeFinding({ location: { file: 'src/foo.ts', startLine: 200 }, evidence: ['this pre-existing bug is exposed by the change'] }));
    expect(result.status).toBe('validated');
  });

  it('rejects a finding for a file not present in the diff at all', () => {
    const result = validate(makeFinding({ location: { file: 'src/other.ts', startLine: 1 } }));
    expect(result.status).toBe('rejected');
  });
});

describe('validateFindings — confidence gate', () => {
  it('rejects a finding below the minimum confidence threshold', () => {
    const result = validate(makeFinding({ confidence: 0.5 }), { minimumConfidence: 0.7 });
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/confidence/);
  });

  it('accepts a finding at exactly the minimum confidence threshold', () => {
    const result = validate(makeFinding({ confidence: 0.7 }), { minimumConfidence: 0.7 });
    expect(result.status).toBe('validated');
  });
});

describe('validateFindings — lint-restatement gate', () => {
  it('rejects a finding that restates an existing lint error on the same line', () => {
    const result = validate(makeFinding({ location: { file: 'src/foo.ts', startLine: 10 } }), {
      lintIssues: [{ file: 'src/foo.ts', line: 10, ruleId: 'no-unused-vars', message: 'unused' }],
    });
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/lint/);
  });

  it('accepts a finding whose line is far from any lint issue', () => {
    const result = validate(makeFinding({ location: { file: 'src/foo.ts', startLine: 10 } }), {
      lintIssues: [{ file: 'src/foo.ts', line: 50, ruleId: 'no-unused-vars', message: 'unused' }],
    });
    expect(result.status).toBe('validated');
  });
});

describe('validateFindings — actionability gate', () => {
  it('rejects a finding with no suggestion', () => {
    const result = validate(makeFinding({ suggestion: undefined }));
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/actionable/);
  });

  it('rejects a finding with a blank/whitespace-only suggestion', () => {
    const result = validate(makeFinding({ suggestion: '   ' }));
    expect(result.status).toBe('rejected');
  });
});

describe('validateFindings — category gate', () => {
  it('rejects a finding with an empty category', () => {
    const result = validate(makeFinding({ category: '' }));
    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/category/);
  });
});
