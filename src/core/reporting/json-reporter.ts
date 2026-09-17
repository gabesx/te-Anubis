import { redact } from '../../utils/logger.js';
import type { Reporter } from './reporter.js';
import type { ReviewResult } from '../types/review-result.js';

export const jsonReporter: Reporter = {
  render(result: ReviewResult): void {
    console.log(redact(JSON.stringify(result, null, 2)));
  },
};
