import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pullsGet = vi.fn();
vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    pulls = { get: pullsGet };
  },
}));

const checkAuthorization = vi.fn();
vi.mock('../../src/github/authorization.js', () => ({ checkAuthorization }));

const parseCommand = vi.fn();
const postReview = vi.fn();
const postPlainComment = vi.fn();
const postExplainComment = vi.fn();
vi.mock('../../src/github/github-integration.js', () => ({
  GitHubIntegration: class MockGitHubIntegration {
    parseCommand = parseCommand;
    postReview = postReview;
    postPlainComment = postPlainComment;
    postExplainComment = postExplainComment;
  },
}));

const runReviewPipeline = vi.fn();
vi.mock('../../src/cli/commands/run-review-pipeline.js', () => ({ runReviewPipeline }));

const { runGithubCommandCommand } = await import('../../src/cli/commands/github-command.js');

describe('runGithubCommandCommand', () => {
  let eventPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'anubis-github-command-test-'));
    eventPath = join(dir, 'event.json');
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_EVENT_PATH = eventPath;
    delete process.env.ANUBIS_TARGET_REPO;

    pullsGet.mockReset().mockResolvedValue({
      data: {
        head: { sha: 'head1', repo: { full_name: 'allofresh/te-Anubis' } },
        base: { sha: 'base1', repo: { full_name: 'allofresh/te-Anubis' } },
      },
    });
    checkAuthorization.mockReset();
    parseCommand.mockReset();
    postReview.mockReset();
    postPlainComment.mockReset();
    postExplainComment.mockReset();
    runReviewPipeline.mockReset().mockResolvedValue({ result: { findings: [] }, changedFiles: [] });
  });

  afterEach(() => {
    rmSync(eventPath, { force: true });
    process.env = { ...originalEnv };
  });

  function writeCommentEvent(body: string, options: { onPr?: boolean } = { onPr: true }) {
    writeFileSync(
      eventPath,
      JSON.stringify({
        action: 'created',
        issue: { number: 5, pull_request: options.onPr ? {} : undefined },
        comment: { body, user: { login: 'alice' } },
        repository: { owner: { login: 'allofresh' }, name: 'te-Anubis', full_name: 'allofresh/te-Anubis' },
      }),
    );
  }

  it('does nothing for a comment on a plain issue (not a PR)', async () => {
    writeCommentEvent('/anubis review', { onPr: false });
    await runGithubCommandCommand();
    expect(pullsGet).not.toHaveBeenCalled();
  });

  it('does nothing for a comment that does not match the /anubis grammar', async () => {
    writeCommentEvent('looks good to me!');
    parseCommand.mockReturnValue(null);
    await runGithubCommandCommand();
    expect(pullsGet).not.toHaveBeenCalled();
  });

  it('posts an insufficient-permission message and does not run review when unauthorized', async () => {
    writeCommentEvent('/anubis fix');
    parseCommand.mockReturnValue({ type: 'fix' });
    checkAuthorization.mockResolvedValue({ allowed: false, requiredLevel: 'write', actorLevel: 'read', reason: 'needs write+' });

    await runGithubCommandCommand();

    expect(postPlainComment).toHaveBeenCalledTimes(1);
    expect(postPlainComment.mock.calls[0][1]).toContain('needs write+');
    expect(runReviewPipeline).not.toHaveBeenCalled();
  });

  it('responds that fix mode is not yet available, without running the pipeline', async () => {
    writeCommentEvent('/anubis fix');
    parseCommand.mockReturnValue({ type: 'fix' });
    checkAuthorization.mockResolvedValue({ allowed: true, requiredLevel: 'write', actorLevel: 'write' });

    await runGithubCommandCommand();

    expect(postPlainComment).toHaveBeenCalledTimes(1);
    expect(postPlainComment.mock.calls[0][1]).toMatch(/not available yet/);
    expect(runReviewPipeline).not.toHaveBeenCalled();
  });

  it('runs a scoped review when /anubis review <skill> is authorized, overriding auto-detect', async () => {
    writeCommentEvent('/anubis review review-wdio-api-automation');
    parseCommand.mockReturnValue({ type: 'review', skill: 'review-wdio-api-automation' });
    checkAuthorization.mockResolvedValue({ allowed: true, requiredLevel: 'read', actorLevel: 'read' });

    await runGithubCommandCommand();

    expect(runReviewPipeline).toHaveBeenCalledTimes(1);
    expect(runReviewPipeline.mock.calls[0][0].overrides).toEqual({ skills: ['review-wdio-api-automation'], autoDetect: false });
    expect(postReview).toHaveBeenCalledTimes(1);
  });

  it('posts an explain comment instead of a full review for /anubis explain', async () => {
    writeCommentEvent('/anubis explain');
    parseCommand.mockReturnValue({ type: 'explain' });
    checkAuthorization.mockResolvedValue({ allowed: true, requiredLevel: 'read', actorLevel: 'read' });

    await runGithubCommandCommand();

    expect(postExplainComment).toHaveBeenCalledTimes(1);
    expect(postReview).not.toHaveBeenCalled();
  });

  it('reviews the target repo directory when ANUBIS_TARGET_REPO is set (split-checkout mode)', async () => {
    process.env.ANUBIS_TARGET_REPO = 'target-repo';
    writeCommentEvent('/anubis review');
    parseCommand.mockReturnValue({ type: 'review', skill: undefined });
    checkAuthorization.mockResolvedValue({ allowed: true, requiredLevel: 'read', actorLevel: 'read' });

    await runGithubCommandCommand();

    expect(runReviewPipeline.mock.calls[0][0].repoRoot).toContain('target-repo');
  });
});
