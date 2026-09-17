import type { Reporter } from './reporter.js';
import type { ReviewResult } from '../types/review-result.js';

export const jsonReporter: Reporter = {
  render(result: ReviewResult): void {
    console.log(JSON.stringify(result, null, 2));
  },
};
