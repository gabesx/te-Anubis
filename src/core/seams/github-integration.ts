import type { ChangedFile } from '../types/context.js';
import type { ReviewResult } from '../types/review-result.js';

/**
 * Implemented in Phase 6 (src/github/). core/ defines the shape; it never
 * implements or imports it — GitHub is an additive layer on top of core.
 */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  headRepoFullName: string;
  baseRepoFullName: string;
  isFork: boolean;
}

export type AnubisCommand = { type: 'review'; skill?: string } | { type: 'fix' } | { type: 'explain' };

export interface GitHubIntegration {
  /** `changedFiles` is what decides inline-comment vs summary-only placement per finding
   * (a finding's line must land inside one of these files' diff hunks to be diff-addressable). */
  postReview(pr: PullRequestRef, result: ReviewResult, changedFiles: ChangedFile[]): Promise<void>;
  parseCommand(commentBody: string): AnubisCommand | null;
}
