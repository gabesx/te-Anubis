import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangedFile } from '../../src/core/types/context.js';
import type { PullRequestRef } from '../../src/core/seams/github-integration.js';
import type { ReviewResult } from '../../src/core/types/review-result.js';

const createReview = vi.fn();
const listReviewComments = vi.fn();
const listComments = vi.fn();
const createComment = vi.fn();
const updateComment = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    pulls = { createReview, listReviewComments };
    issues = { listComments, createComment, updateComment };
  },
}));

const { GitHubIntegration } = await import('../../src/github/github-integration.js');
const { findingMarker, SUMMARY_MARKER } = await import('../../src/github/markers.js');

const pr: PullRequestRef = {
  owner: 'allofresh',
  repo: 'te-Anubis',
  number: 42,
  headSha: 'abc123',
  headRepoFullName: 'allofresh/te-Anubis',
  baseRepoFullName: 'allofresh/te-Anubis',
  isFork: false,
};

const changedFile: ChangedFile = {
  path: 'src/foo.ts',
  changeType: 'modified',
  hunks: [{ startLine: 8, endLine: 15, content: 'hunk' }],
  language: 'typescript',
  classification: 'source',
};

function makeResult(findings: ReviewResult['findings']): ReviewResult {
  return {
    runId: 'run-1',
    repo: { root: '/repo' },
    target: { baseRef: 'base', headRef: 'head', commitSha: 'sha' },
    provider: { name: 'anthropic', model: 'claude-sonnet-4-5' },
    skillsUsed: ['code-convention'],
    findings,
    summary: { countsBySeverity: { BLOCKER: 0, HIGH: findings.length, MEDIUM: 0, LOW: 0, SUGGESTION: 0 }, filesAnalyzed: 1, filesSkipped: 0 },
    validation: {},
    metrics: { llmRequests: 1, tokensIn: 1, tokensOut: 1, estimatedCostUsd: 0, durationMs: 1, findingsGenerated: 1, findingsRejected: 0, findingsFinal: findings.length, stageDurations: {} },
    generatedAt: new Date().toISOString(),
  };
}

function makeFinding(id: string, startLine = 10): ReviewResult['findings'][number] {
  return {
    id,
    severity: 'HIGH',
    category: 'bug',
    location: { file: 'src/foo.ts', startLine },
    title: 'Something is wrong',
    problem: 'p',
    rationale: 'r',
    suggestion: 's',
    confidence: 0.9,
    skillId: 'code-convention',
    autoFixable: false,
    status: 'validated',
  };
}

describe('GitHubIntegration.postReview', () => {
  beforeEach(() => {
    createReview.mockReset().mockResolvedValue({});
    listReviewComments.mockReset().mockResolvedValue({ data: [] });
    listComments.mockReset().mockResolvedValue({ data: [] });
    createComment.mockReset().mockResolvedValue({});
    updateComment.mockReset().mockResolvedValue({});
  });

  it('posts a batched review with one inline comment per diff-addressable finding', async () => {
    const integration = new GitHubIntegration('fake-token');
    const result = makeResult([makeFinding('f1', 10)]);

    await integration.postReview(pr, result, [changedFile]);

    expect(createReview).toHaveBeenCalledTimes(1);
    const call = createReview.mock.calls[0][0];
    expect(call.pull_number).toBe(42);
    expect(call.commit_id).toBe('abc123');
    expect(call.comments).toHaveLength(1);
    expect(call.comments[0].path).toBe('src/foo.ts');
    expect(call.comments[0].line).toBe(10);
  });

  it('creates a new summary comment when none exists yet', async () => {
    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([]), [changedFile]);

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment.mock.calls[0][0].body).toContain(SUMMARY_MARKER);
  });

  it('updates the existing summary comment in place on a re-run instead of duplicating it', async () => {
    listComments.mockResolvedValue({
      data: [{ id: 999, user: { login: 'github-actions[bot]' }, body: `${SUMMARY_MARKER}\nold summary` }],
    });

    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([]), [changedFile]);

    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(updateComment.mock.calls[0][0].comment_id).toBe(999);
    expect(createComment).not.toHaveBeenCalled();
  });

  it('ignores a summary-marker comment authored by someone other than the bot', async () => {
    listComments.mockResolvedValue({
      data: [{ id: 999, user: { login: 'a-random-contributor' }, body: `${SUMMARY_MARKER}\nforged by a commenter` }],
    });

    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([]), [changedFile]);

    // Doesn't overwrite the forged comment — treats it as if no summary exists yet and creates its own.
    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledTimes(1);
  });

  it('does not repost an inline comment for a finding already posted by the bot on a previous run', async () => {
    listReviewComments.mockResolvedValue({
      data: [{ user: { login: 'github-actions[bot]' }, body: `${findingMarker('f1')}\nalready here` }],
    });

    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([makeFinding('f1', 10)]), [changedFile]);

    expect(createReview).not.toHaveBeenCalled();
  });

  it('does not treat a finding marker forged by a non-bot commenter as already posted', async () => {
    listReviewComments.mockResolvedValue({
      data: [{ user: { login: 'a-random-contributor' }, body: `${findingMarker('f1')}\nforged marker` }],
    });

    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([makeFinding('f1', 10)]), [changedFile]);

    expect(createReview).toHaveBeenCalledTimes(1);
    expect(createReview.mock.calls[0][0].comments).toHaveLength(1);
  });

  it('only posts genuinely new findings when some were already posted by the bot', async () => {
    listReviewComments.mockResolvedValue({
      data: [{ user: { login: 'github-actions[bot]' }, body: `${findingMarker('f1')}\nalready here` }],
    });

    const integration = new GitHubIntegration('fake-token');
    await integration.postReview(pr, makeResult([makeFinding('f1', 10), makeFinding('f2', 12)]), [changedFile]);

    expect(createReview).toHaveBeenCalledTimes(1);
    expect(createReview.mock.calls[0][0].comments).toHaveLength(1);
    expect(createReview.mock.calls[0][0].comments[0].line).toBe(12);
  });

  it('respects a custom botLogin passed to the constructor', async () => {
    listComments.mockResolvedValue({
      data: [{ id: 5, user: { login: 'my-custom-bot' }, body: `${SUMMARY_MARKER}\nold` }],
    });

    const integration = new GitHubIntegration('fake-token', 'my-custom-bot');
    await integration.postReview(pr, makeResult([]), [changedFile]);

    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(updateComment.mock.calls[0][0].comment_id).toBe(5);
  });

  it('rolls a non-diff-addressable finding into the summary instead of attempting an inline comment', async () => {
    const integration = new GitHubIntegration('fake-token');
    const repoLevelFinding = { ...makeFinding('f1'), location: null };

    await integration.postReview(pr, makeResult([repoLevelFinding]), [changedFile]);

    expect(createReview).not.toHaveBeenCalled();
    expect(createComment.mock.calls[0][0].body).toContain('Something is wrong');
  });
});
