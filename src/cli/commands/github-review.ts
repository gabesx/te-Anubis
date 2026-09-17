import {
  pullRequestRefFromEvent,
  readEventPayload,
  requireGithubToken,
  type PullRequestEventPayload,
} from '../../github/action-context.js';
import { GitHubIntegration } from '../../github/github-integration.js';
import { logger, logRunSummary } from '../../utils/logger.js';
import { runReviewPipeline } from './run-review-pipeline.js';

/**
 * Entry point for the `pull_request` workflow (opened/reopened/synchronize).
 * Deliberately never runs under `pull_request_target` — see .github/workflows/anubis-review.yml —
 * so fork PRs get GitHub's own read-only token/no-secrets sandboxing "for free."
 */
export async function runGithubReviewCommand(): Promise<void> {
  const token = requireGithubToken();
  const payload = readEventPayload<PullRequestEventPayload>();
  const pr = pullRequestRefFromEvent(payload);
  const integration = new GitHubIntegration(token, process.env.ANUBIS_BOT_LOGIN);

  if (pr.isFork) {
    logger.info('Reviewing a fork PR — read-only review only, no write-back capability in this job context.');
  }

  try {
    const { result, changedFiles } = await runReviewPipeline({
      repoRoot: process.cwd(),
      baseRef: payload.pull_request.base.sha,
      headRef: payload.pull_request.head.sha,
      prNumber: pr.number,
    });

    await integration.postReview(pr, result, changedFiles);
    logRunSummary(result);
  } catch (err) {
    if (pr.isFork) {
      // GitHub structurally withholds repository secrets (including the AI provider key) from
      // `pull_request`-triggered runs on fork PRs — that's the platform guarantee this workflow
      // relies on for safety, not a bug to route around. A missing/failing provider here is an
      // expected condition for a fork PR, not something to crash on.
      await integration.postPlainComment(
        pr,
        "🐺 Anubis can't run an AI-powered review on this fork PR: GitHub does not expose repository secrets to `pull_request`-triggered workflows from forks, by design. A maintainer can review this manually, or re-run after the PR is merged into a branch of this repository.",
      );
      logger.warn('AI review unavailable for fork PR', { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    throw err;
  }
}
