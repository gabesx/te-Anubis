import OpenAI from 'openai';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { estimateCostUsd } from './pricing.js';
import type { AIProvider, AIRequest, AIResponse, AIUsage } from './provider.js';

const DEFAULT_MODEL = 'gpt-4o';

let warnedOnce = false;

/**
 * MVP: minimal implementation. Satisfies the AIProvider contract with a
 * genuine, working SDK call (not a stub) — a single non-streaming completion,
 * default SDK retry behavior, no cost/token nuance beyond what the SDK
 * returns. Revisit before treating this as a production-default provider.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) {
      throw new ProviderError('openai', 'OPENAI_API_KEY is not set. Set it as an environment variable.');
    }
    if (!warnedOnce) {
      logger.warn('OpenAI provider is an MVP-minimal implementation — revisit before production use.');
      warnedOnce = true;
    }
    this.client = new OpenAI({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content ?? '';

      return {
        text,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError('openai', `request failed: ${message}`);
    }
  }

  estimateCost(usage: AIUsage): number {
    return estimateCostUsd('openai', this.model, usage);
  }
}
