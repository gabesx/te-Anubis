import type { ReviewResult } from '../types/review-result.js';

/**
 * Named-but-empty seam. Implemented in Phase 8 (src/fix/FixEngine.ts).
 * core/ defines the interface; it never implements or imports it.
 */
export interface FixInput {
  reviewResult: ReviewResult;
  mode: 'suggest' | 'fix';
  repoRoot: string;
}

export interface AppliedFix {
  findingId: string;
  commitSha: string;
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
