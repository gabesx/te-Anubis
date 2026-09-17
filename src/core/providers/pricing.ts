import type { AIUsage, ProviderName } from './provider.js';

/**
 * Static per-model pricing, USD per million tokens. This WILL drift as
 * providers change prices — there is no code-level fix for that, only a
 * manual-update process. Treat `estimateCostUsd` in reports as an
 * approximation, not a billing-accurate figure.
 *
 * Last reviewed: 2026-09 (Phase 2 implementation).
 */
const PRICING_TABLE: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
};

const PROVIDER_FALLBACK: Record<ProviderName, { inputPerMillion: number; outputPerMillion: number }> = {
  anthropic: PRICING_TABLE['claude-sonnet-4-5']!,
  openai: PRICING_TABLE['gpt-4o']!,
  gemini: PRICING_TABLE['gemini-1.5-pro']!,
};

export function estimateCostUsd(provider: ProviderName, model: string, usage: AIUsage): number {
  const rates = PRICING_TABLE[model] ?? PROVIDER_FALLBACK[provider];
  const inputCost = (usage.inputTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.outputPerMillion;
  return inputCost + outputCost;
}
