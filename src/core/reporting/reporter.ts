import type { ReviewResult } from '../types/review-result.js';

export interface Reporter {
  render(result: ReviewResult): Promise<void> | void;
}
