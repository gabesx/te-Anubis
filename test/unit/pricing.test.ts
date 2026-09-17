import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from '../../src/core/providers/pricing.js';

describe('estimateCostUsd', () => {
  it('computes cost from known per-model input/output rates', () => {
    // claude-sonnet-4-5: $3/million input, $15/million output
    const cost = estimateCostUsd('anthropic', 'claude-sonnet-4-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it('falls back to a provider default when the model is unrecognized', () => {
    const knownModelCost = estimateCostUsd('openai', 'gpt-4o', { inputTokens: 500_000, outputTokens: 0 });
    const unknownModelCost = estimateCostUsd('openai', 'some-future-model-not-in-table', { inputTokens: 500_000, outputTokens: 0 });
    expect(unknownModelCost).toBeCloseTo(knownModelCost, 5);
  });

  it('scales linearly with token count', () => {
    const usageA = estimateCostUsd('gemini', 'gemini-1.5-pro', { inputTokens: 100_000, outputTokens: 100_000 });
    const usageB = estimateCostUsd('gemini', 'gemini-1.5-pro', { inputTokens: 200_000, outputTokens: 200_000 });
    expect(usageB).toBeCloseTo(usageA * 2, 5);
  });

  it('returns zero for zero usage', () => {
    expect(estimateCostUsd('anthropic', 'claude-sonnet-4-5', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
