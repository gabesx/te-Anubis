import { resolve } from 'node:path';
import { Octokit } from '@octokit/rest';
import { checkAuthorization } from '../../github/authorization.js';
import { GitHubIntegration } from '../../github/github-integration.js';
import { readEventPayload, requireGithubToken, type IssueCommentEventPayload } from '../../github/action-context.js';
import type { PullRequestRef } from '../../core/seams/github-integration.js';
import { logger, logRunSummary } from '../../utils/logger.js';
import { runReviewPipeline } from './run-review-pipeline.js';

/**
 * Entry point for the `issue_comment` workflow — handles `/anubis review [skill]`,
 * `/anubis explain`, and `/anubis fix` (not yet implemented; responds saying so
 * rather than silently ignoring the command).
 *
 * `issue_comment` runs in the base repo's context and — unlike `pull_request` —
 * is NOT automatically stripped of secrets/write access for a comment on a fork
 * PR. That means this job must never `npm ci`/build/execute the PR's own
 * checked-out content (a malicious fork PR's postinstall script could exploit
 * that to reach the secrets this job does have). The workflow
 * (.github/workflows/anubis-command.yml) checks out Anubis's own trusted
 * source at the primary path and the PR's head into a separate `ANUBIS_TARGET_REPO`
 * directory that is only ever read as data (git diff, file reads) — never
 * installed or executed.
 */
export async function runGithubCommandCommand(): Promise<void> {
  const token = requireGithubToken();
  const payload = readEventPayload<IssueCommentEventPayload>();

  if (!payload.issue.pull_request) {
    return; // a comment on a plain issue, not a PR — nothing for Anubis to do
  }

  const integration = new GitHubIntegration(token, process.env.ANUBIS_BOT_LOGIN);
  const command = integration.parseCommand(payload.comment.body);
  if (!command) {
    return; // doesn't match the strict /anubis <command> grammar — not addressed to us
  }

  const octokit = new Octokit({ auth: token });
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const actor = payload.comment.user.login;

  const authorization = await checkAuthorization(octokit, owner, repo, actor, command);

  const { data: prData } = await octokit.pulls.get({ owner, repo, pull_number: payload.issue.number });
  const pr: PullRequestRef = {
    owner,
    repo,
    number: payload.issue.number,
    headSha: prData.head.sha,
    headRepoFullName: prData.head.repo?.full_name ?? `${owner}/${repo}`,
    baseRepoFullName: prData.base.repo.full_name,
    isFork: (prData.head.repo?.full_name ?? `${owner}/${repo}`) !== prData.base.repo.full_name,
  };

  if (!authorization.allowed) {
    await integration.postPlainComment(pr, `🐺 @${actor}, ${authorization.reason}.`);
    return;
  }

  if (command.type === 'fix') {
    await integration.postPlainComment(
      pr,
      '🐺 `/anubis fix` is not available yet — automated fix/commit mode ships in a later phase. Run `/anubis review` for a read-only review.',
    );
    return;
  }

  const targetRepoRoot = process.env.ANUBIS_TARGET_REPO ? resolve(process.env.ANUBIS_TARGET_REPO) : process.cwd();

  const { result, changedFiles } = await runReviewPipeline({
    repoRoot: targetRepoRoot,
    baseRef: prData.base.sha,
    headRef: prData.head.sha,
    prNumber: pr.number,
    overrides: command.type === 'review' && command.skill ? { skills: [command.skill], autoDetect: false } : undefined,
  });

  if (command.type === 'explain') {
    await integration.postExplainComment(pr, result);
  } else {
    await integration.postReview(pr, result, changedFiles);
  }

  logger.info('Handled command', { command: command.type, actor });
  logRunSummary(result);
}
