/** ~4 chars/token is a standard rough heuristic for English/code — good enough for budget allocation, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BudgetAllocation {
  diffTokens: number;
  relatedFilesTokens: number;
  manifestTokens: number;
  historyTokens: number;
}

/** Default weighted split: diff 40% / related files 30% / manifest 15% / history 15%. */
const WEIGHTS = { diff: 0.4, relatedFiles: 0.3, manifest: 0.15, history: 0.15 } as const;

export function allocateBudget(totalBudget: number): BudgetAllocation {
  return {
    diffTokens: Math.floor(totalBudget * WEIGHTS.diff),
    relatedFilesTokens: Math.floor(totalBudget * WEIGHTS.relatedFiles),
    manifestTokens: Math.floor(totalBudget * WEIGHTS.manifest),
    historyTokens: Math.floor(totalBudget * WEIGHTS.history),
  };
}

/** Truncates text to fit a token budget. Callers apply this to the lowest-priority
 * content first — diff hunks are never passed through this, by convention, not by
 * a flag here. */
export function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const charBudget = tokenBudget * 4;
  if (text.length <= charBudget) return text;
  return `${text.slice(0, Math.max(charBudget - 24, 0))}\n… [truncated to fit context budget]`;
}
