import type { ReviewResult } from '../types/review-result.js';

/**
 * Implemented in Phase 8 (src/fix/). core/ defines the shape; it never
 * implements or imports it — the Fix Engine is an additive layer on top of
 * the review engine, same as GitHub Integration.
 */
export interface FixInput {
  reviewResult: ReviewResult;
  mode: 'suggest' | 'fix';
  repoRoot: string;
  /** From `.anubis.yml` `fix.allowed` (defaults to `['SAFE']`) — which safety classes are
   * even eligible for automated action at all. UNSAFE is never in here in practice; a
   * REVIEW_REQUIRED finding is still only ever "suggested," never auto-committed, regardless
   * of this list. */
  allowedSafetyClasses: ('SAFE' | 'REVIEW_REQUIRED' | 'UNSAFE')[];
}

export interface AppliedFix {
  findingId: string;
}
export interface SuggestedFix {
  findingId: string;
  diff: string;
}
export interface SkippedFix {
  findingId: string;
  reason: string;
}

export interface FixResult {
  applied: AppliedFix[];
  suggested: SuggestedFix[];
  skipped: SkippedFix[];
  commit?: { sha: string; pushed: boolean };
  fallback?: 'suggestions' | 'patch-download' | null;
}

export interface FixEngine {
  run(input: FixInput): Promise<FixResult>;
}
