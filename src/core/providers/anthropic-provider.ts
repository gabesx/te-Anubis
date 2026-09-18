import Anthropic from '@anthropic-ai/sdk';
import { ProviderError } from '../../utils/errors.js';
import { estimateCostUsd } from './pricing.js';
import type { AIProvider, AIRequest, AIResponse, AIUsage } from './provider.js';

// claude-sonnet-4-5 (the previous default) has been superseded by the Claude 5 family.
const DEFAULT_MODEL = 'claude-sonnet-5';

/**
 * Non-streaming on purpose: findings are consumed as parsed JSON, so
 * token-by-token delivery buys nothing. CLI progress comes from the pipeline
 * logging per-file/batch completion, not from streamed tokens.
 *
 * Retries/timeouts are the SDK's own `maxRetries`/`timeout` client options —
 * no hand-rolled backoff here.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) {
      throw new ProviderError('anthropic', 'ANTHROPIC_API_KEY is not set. Set it as an environment variable.');
    }
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 120_000 });
    this.model = model ?? DEFAULT_MODEL;
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError('anthropic', `request failed: ${message}`);
    }
  }

  estimateCost(usage: AIUsage): number {
    return estimateCostUsd('anthropic', this.model, usage);
  }
}
