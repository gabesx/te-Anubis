import { Octokit } from '@octokit/rest';
import type { AnubisCommand, GitHubIntegration as GitHubIntegrationInterface, PullRequestRef } from '../core/seams/github-integration.js';
import type { ChangedFile } from '../core/types/context.js';
import type { ReviewResult } from '../core/types/review-result.js';
import { parseCommand } from './command-parser.js';
import { formatInlineCommentBody, partitionFindings } from './finding-mapper.js';
import { extractFindingId } from './markers.js';
import { formatSummaryComment } from './summary-formatter.js';
import { SUMMARY_MARKER } from './markers.js';

/**
 * The only place that talks to the GitHub REST API. Idempotency: an inline
 * comment already posted for a given finding id (found via its marker) is
 * never reposted on a re-run; the summary comment is found by its marker and
 * updated in place rather than duplicated.
 */
export class GitHubIntegration implements GitHubIntegrationInterface {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  parseCommand(commentBody: string): AnubisCommand | null {
    return parseCommand(commentBody);
  }

  async postReview(pr: PullRequestRef, result: ReviewResult, changedFiles: ChangedFile[]): Promise<void> {
    const { inline, summaryOnly } = partitionFindings(result.findings, changedFiles);

    const alreadyPosted = await this.getAlreadyPostedFindingIds(pr);
    const newInlineFindings = inline.filter((f) => !alreadyPosted.has(f.id));

    if (newInlineFindings.length > 0) {
      await this.octokit.pulls.createReview({
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.number,
        commit_id: pr.headSha,
        event: 'COMMENT',
        comments: newInlineFindings.map((f) => ({
          path: f.location!.file,
          line: f.location!.startLine,
          body: formatInlineCommentBody(f),
        })),
      });
    }

    await this.upsertSummaryComment(pr, result, summaryOnly);
  }

  /** Posts a one-off elaboration of the current findings — read-only, not a general chat surface. */
  async postExplainComment(pr: PullRequestRef, result: ReviewResult): Promise<void> {
    if (result.findings.length === 0) {
      await this.octokit.issues.createComment({
        owner: pr.owner,
        repo: pr.repo,
        issue_number: pr.number,
        body: '🐺 No current findings to elaborate on.',
      });
      return;
    }

    const lines = ['🐺 **Anubis explain**', ''];
    for (const f of result.findings) {
      const location = f.location ? `${f.location.file}:${f.location.startLine}` : '(repo-level)';
      lines.push(
        `### [${f.severity}] ${f.title}`,
        `_${location}_`,
        '',
        `**Problem:** ${f.problem}`,
        `**Why it matters:** ${f.rationale}`,
      );
      if (f.evidence && f.evidence.length > 0) {
        lines.push(`**Evidence:** ${f.evidence.join('; ')}`);
      }
      if (f.suggestion) {
        lines.push(`**Suggested fix:** ${f.suggestion}`);
      }
      lines.push(`**Skill:** \`${f.skillId}\` · **Confidence:** ${Math.round(f.confidence * 100)}%`, '');
    }

    await this.octokit.issues.createComment({ owner: pr.owner, repo: pr.repo, issue_number: pr.number, body: lines.join('\n') });
  }

  async postPlainComment(pr: PullRequestRef, body: string): Promise<void> {
    await this.octokit.issues.createComment({ owner: pr.owner, repo: pr.repo, issue_number: pr.number, body });
  }

  private async getAlreadyPostedFindingIds(pr: PullRequestRef): Promise<Set<string>> {
    const { data } = await this.octokit.pulls.listReviewComments({
      owner: pr.owner,
      repo: pr.repo,
      pull_number: pr.number,
      per_page: 100,
    });
    const ids = new Set<string>();
    for (const comment of data) {
      const id = extractFindingId(comment.body ?? '');
      if (id) ids.add(id);
    }
    return ids;
  }

  private async upsertSummaryComment(pr: PullRequestRef, result: ReviewResult, summaryOnlyFindings: ReviewResult['findings']): Promise<void> {
    const body = formatSummaryComment(result, summaryOnlyFindings);

    const { data: comments } = await this.octokit.issues.listComments({
      owner: pr.owner,
      repo: pr.repo,
      issue_number: pr.number,
      per_page: 100,
    });
    const existing = comments.find((c) => c.body?.includes(SUMMARY_MARKER));

    if (existing) {
      await this.octokit.issues.updateComment({ owner: pr.owner, repo: pr.repo, comment_id: existing.id, body });
    } else {
      await this.octokit.issues.createComment({ owner: pr.owner, repo: pr.repo, issue_number: pr.number, body });
    }
  }
}
