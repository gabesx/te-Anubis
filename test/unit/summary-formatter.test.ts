import { describe, expect, it } from 'vitest';
import { formatSummaryComment } from '../../src/github/summary-formatter.js';
import { SUMMARY_MARKER } from '../../src/github/markers.js';
import type { ReviewResult } from '../../src/core/types/review-result.js';

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    runId: 'run-1',
    repo: { root: '/repo' },
    target: { baseRef: 'base', headRef: 'head', commitSha: 'sha' },
    provider: { name: 'anthropic', model: 'claude-sonnet-4-5' },
    skillsUsed: ['code-convention', 'review-wdio-api-automation'],
    findings: [],
    summary: {
      countsBySeverity: { BLOCKER: 0, HIGH: 1, MEDIUM: 0, LOW: 0, SUGGESTION: 0 },
      filesAnalyzed: 3,
      filesSkipped: 0,
    },
    validation: {},
    metrics: {
      llmRequests: 1,
      tokensIn: 100,
      tokensOut: 50,
      estimatedCostUsd: 0.01,
      durationMs: 500,
      findingsGenerated: 1,
      findingsRejected: 0,
      findingsFinal: 1,
      stageDurations: {},
    },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('formatSummaryComment', () => {
  it('embeds the summary marker for idempotent update-in-place', () => {
    const body = formatSummaryComment(makeResult(), []);
    expect(body).toContain(SUMMARY_MARKER);
  });

  it('includes severity counts, skills used, and provider', () => {
    const body = formatSummaryComment(makeResult(), []);
    expect(body).toContain('HIGH: 1');
    expect(body).toContain('review-wdio-api-automation');
    expect(body).toContain('Provider: anthropic (claude-sonnet-4-5)');
  });

  it('lists repo-level findings separately when present', () => {
    const finding = {
      id: 'x',
      severity: 'MEDIUM' as const,
      category: 'maintainability',
      location: null,
      title: 'Config drift across environments',
      problem: 'p',
      rationale: 'r',
      confidence: 0.8,
      skillId: 'code-convention',
      autoFixable: false,
      status: 'validated' as const,
    };
    const body = formatSummaryComment(makeResult(), [finding]);
    expect(body).toContain('Config drift across environments');
  });

  it('renders the validation checklist when present', () => {
    const body = formatSummaryComment(
      makeResult({ validation: { lint: { tool: 'eslint', passed: true, summary: 'no lint errors' } } }),
      [],
    );
    expect(body).toContain('✓ eslint: no lint errors');
  });

  it('never includes raw internal fields like runId in the rendered text', () => {
    const body = formatSummaryComment(makeResult({ runId: 'super-secret-run-id-marker' }), []);
    expect(body).not.toContain('super-secret-run-id-marker');
  });
});
