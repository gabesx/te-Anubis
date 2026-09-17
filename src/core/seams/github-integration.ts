import type { ReviewResult } from '../types/review-result.js';

/**
 * Named-but-empty seam. Implemented in Phase 6 (src/github/GitHubIntegration.ts).
 * core/ defines the interface; it never implements or imports it.
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
  postReview(pr: PullRequestRef, result: ReviewResult): Promise<void>;
  parseCommand(commentBody: string): AnubisCommand | null;
}
