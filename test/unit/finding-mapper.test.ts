import { describe, expect, it } from 'vitest';
import { formatInlineCommentBody, partitionFindings } from '../../src/github/finding-mapper.js';
import { extractFindingId } from '../../src/github/markers.js';
import type { ChangedFile } from '../../src/core/types/context.js';
import type { Finding } from '../../src/core/types/finding.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'abc123',
    severity: 'HIGH',
    category: 'bug',
    location: { file: 'src/foo.ts', startLine: 10 },
    title: 'A finding',
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

const changedFile: ChangedFile = {
  path: 'src/foo.ts',
  changeType: 'modified',
  hunks: [{ startLine: 8, endLine: 15, content: 'hunk' }],
  language: 'typescript',
  classification: 'source',
};

describe('partitionFindings', () => {
  it('puts a finding whose line is inside a diff hunk into inline', () => {
    const { inline, summaryOnly } = partitionFindings([makeFinding({ location: { file: 'src/foo.ts', startLine: 10 } })], [changedFile]);
    expect(inline).toHaveLength(1);
    expect(summaryOnly).toHaveLength(0);
  });

  it('puts a repo-level (null-location) finding into summaryOnly', () => {
    const { inline, summaryOnly } = partitionFindings([makeFinding({ location: null })], [changedFile]);
    expect(inline).toHaveLength(0);
    expect(summaryOnly).toHaveLength(1);
  });

  it('puts a finding on a line outside every diff hunk into summaryOnly', () => {
    const { inline, summaryOnly } = partitionFindings([makeFinding({ location: { file: 'src/foo.ts', startLine: 500 } })], [changedFile]);
    expect(inline).toHaveLength(0);
    expect(summaryOnly).toHaveLength(1);
  });

  it('puts a finding for a file not in the PR diff into summaryOnly', () => {
    const { inline, summaryOnly } = partitionFindings([makeFinding({ location: { file: 'src/other.ts', startLine: 1 } })], [changedFile]);
    expect(inline).toHaveLength(0);
    expect(summaryOnly).toHaveLength(1);
  });
});

describe('formatInlineCommentBody', () => {
  it('embeds a finding marker that extractFindingId can recover', () => {
    const finding = makeFinding({ id: 'deadbeef01' });
    const body = formatInlineCommentBody(finding);
    expect(extractFindingId(body)).toBe('deadbeef01');
  });

  it('includes the severity, title, and skill', () => {
    const body = formatInlineCommentBody(makeFinding({ severity: 'BLOCKER', title: 'Serious issue', skillId: 'review-wdio-api-automation' }));
    expect(body).toContain('BLOCKER');
    expect(body).toContain('Serious issue');
    expect(body).toContain('review-wdio-api-automation');
  });
});
