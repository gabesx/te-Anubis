import type { AIUsage, ProviderName } from './provider.js';

/**
 * Static per-model pricing, USD per million tokens. This WILL drift as
 * providers change prices — there is no code-level fix for that, only a
 * manual-update process. Treat `estimateCostUsd` in reports as an
 * approximation, not a billing-accurate figure.
 *
 * Superseded model entries (e.g. claude-sonnet-4-5, gemini-1.5-pro) are kept
 * so cost estimation stays accurate for anyone still pinning one explicitly
 * via `ai.model` — only the *default* model each provider requests changed.
 *
 * Last reviewed: 2026-09-18 — a live smoke test against the real Gemini API
 * that day found gemini-1.5-pro fully retired (404), which is what prompted
 * this review and the switch to "-latest" aliases as defaults (see
 * gemini-provider.ts / anthropic-provider.ts).
 */
const PRICING_TABLE: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-5': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gemini-flash-latest': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-pro-latest': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-2.5-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
};

const PROVIDER_FALLBACK: Record<ProviderName, { inputPerMillion: number; outputPerMillion: number }> = {
  anthropic: PRICING_TABLE['claude-sonnet-5']!,
  openai: PRICING_TABLE['gpt-4o']!,
  gemini: PRICING_TABLE['gemini-flash-latest']!,
};

export function estimateCostUsd(provider: ProviderName, model: string, usage: AIUsage): number {
  const rates = PRICING_TABLE[model] ?? PROVIDER_FALLBACK[provider];
  const inputCost = (usage.inputTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.outputPerMillion;
  return inputCost + outputCost;
}
