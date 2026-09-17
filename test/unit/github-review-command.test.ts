import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postReview = vi.fn();
const postPlainComment = vi.fn();

vi.mock('../../src/github/github-integration.js', () => ({
  GitHubIntegration: class MockGitHubIntegration {
    postReview = postReview;
    postPlainComment = postPlainComment;
  },
}));

const runReviewPipeline = vi.fn();
vi.mock('../../src/cli/commands/run-review-pipeline.js', () => ({
  runReviewPipeline,
}));

const { runGithubReviewCommand } = await import('../../src/cli/commands/github-review.js');

describe('runGithubReviewCommand', () => {
  let eventPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'anubis-github-review-test-'));
    eventPath = join(dir, 'event.json');
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_EVENT_PATH = eventPath;
    postReview.mockReset();
    postPlainComment.mockReset();
    runReviewPipeline.mockReset();
  });

  afterEach(() => {
    rmSync(eventPath, { force: true });
    process.env = { ...originalEnv };
  });

  function writeEvent(headRepoFullName: string) {
    writeFileSync(
      eventPath,
      JSON.stringify({
        action: 'opened',
        number: 3,
        pull_request: {
          number: 3,
          head: { sha: 'head1', ref: 'feature', repo: { full_name: headRepoFullName } },
          base: { sha: 'base1', ref: 'main', repo: { full_name: 'allofresh/te-Anubis' } },
        },
        repository: { owner: { login: 'allofresh' }, name: 'te-Anubis', full_name: 'allofresh/te-Anubis' },
      }),
    );
  }

  it('throws when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    writeEvent('allofresh/te-Anubis');
    await expect(runGithubReviewCommand()).rejects.toThrow(/GITHUB_TOKEN/);
  });

  function makeFakeReviewResult() {
    return {
      runId: 'run-1',
      repo: { root: '/repo' },
      target: { baseRef: 'base1', headRef: 'head1', commitSha: 'head1', prNumber: 3 },
      provider: { name: 'anthropic', model: 'claude-sonnet-4-5' },
      skillsUsed: [],
      findings: [],
      summary: { countsBySeverity: { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0, SUGGESTION: 0 }, filesAnalyzed: 2, filesSkipped: 0 },
      validation: {},
      metrics: { llmRequests: 0, tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0, durationMs: 0, findingsGenerated: 0, findingsRejected: 0, findingsFinal: 0, stageDurations: {} },
      generatedAt: new Date().toISOString(),
    };
  }

  it('runs the review pipeline and posts the result for a same-repo PR', async () => {
    writeEvent('allofresh/te-Anubis');
    runReviewPipeline.mockResolvedValue({ result: makeFakeReviewResult(), changedFiles: [] });

    await runGithubReviewCommand();

    expect(runReviewPipeline).toHaveBeenCalledTimes(1);
    expect(runReviewPipeline.mock.calls[0][0]).toMatchObject({ baseRef: 'base1', headRef: 'head1', prNumber: 3 });
    expect(postReview).toHaveBeenCalledTimes(1);
    expect(postPlainComment).not.toHaveBeenCalled();
  });

  it('degrades gracefully with an informative comment when review fails on a fork PR', async () => {
    writeEvent('someone-else/te-Anubis');
    runReviewPipeline.mockRejectedValue(new Error('[anthropic] ANTHROPIC_API_KEY is not set.'));

    await runGithubReviewCommand();

    expect(postPlainComment).toHaveBeenCalledTimes(1);
    expect(postPlainComment.mock.calls[0][1]).toMatch(/fork/i);
    expect(postReview).not.toHaveBeenCalled();
  });

  it('rethrows a review failure for a same-repo (non-fork) PR instead of silently swallowing it', async () => {
    writeEvent('allofresh/te-Anubis');
    runReviewPipeline.mockRejectedValue(new Error('something genuinely broke'));

    await expect(runGithubReviewCommand()).rejects.toThrow('something genuinely broke');
    expect(postPlainComment).not.toHaveBeenCalled();
  });
});
