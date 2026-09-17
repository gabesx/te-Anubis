import { describe, expect, it } from 'vitest';
import { allocateBudget, estimateTokens, truncateToTokenBudget } from '../../src/core/context/budget.js';

describe('allocateBudget', () => {
  it('splits the budget 40/30/15/15 across diff/related/manifest/history', () => {
    const allocation = allocateBudget(1000);
    expect(allocation.diffTokens).toBe(400);
    expect(allocation.relatedFilesTokens).toBe(300);
    expect(allocation.manifestTokens).toBe(150);
    expect(allocation.historyTokens).toBe(150);
  });
});

describe('estimateTokens', () => {
  it('approximates ~4 characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('truncateToTokenBudget', () => {
  it('leaves text under budget untouched', () => {
    const text = 'short text';
    expect(truncateToTokenBudget(text, 1000)).toBe(text);
  });

  it('truncates text over budget and marks it as truncated', () => {
    const longText = 'x'.repeat(10_000);
    const result = truncateToTokenBudget(longText, 10); // 10 tokens ~= 40 chars
    expect(result.length).toBeLessThan(longText.length);
    expect(result).toContain('[truncated to fit context budget]');
  });
});
