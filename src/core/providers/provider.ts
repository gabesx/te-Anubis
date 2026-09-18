export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIResponse {
  text: string;
  usage: AIUsage;
  model: string;
}

export type ProviderName = 'anthropic' | 'openai' | 'gemini';

export interface AIProvider {
  readonly name: ProviderName;
  complete(req: AIRequest): Promise<AIResponse>;
  estimateCost(usage: AIUsage): number;
}

/** The env var each provider reads its API key from — the single source of truth for both
 * provider-factory.ts (constructing a concrete provider) and config auto-detection (deciding
 * which provider to use when none is explicitly configured). */
export const PROVIDER_ENV_VARS: Record<ProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

/** Auto-detection priority when `ai.provider` is left as "auto": checked in this order, the
 * first one whose env var is actually set wins. Gemini first per explicit product decision. */
export const PROVIDER_AUTO_DETECT_PRIORITY: ProviderName[] = ['gemini', 'anthropic', 'openai'];
