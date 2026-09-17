import { GoogleGenAI } from '@google/genai';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { estimateCostUsd } from './pricing.js';
import type { AIProvider, AIRequest, AIResponse, AIUsage } from './provider.js';

const DEFAULT_MODEL = 'gemini-1.5-pro';

let warnedOnce = false;

/**
 * MVP: minimal implementation. Satisfies the AIProvider contract with a
 * genuine, working SDK call (not a stub) — a single non-streaming completion,
 * default SDK retry behavior, no cost/token nuance beyond what the SDK
 * returns. Revisit before treating this as a production-default provider.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) {
      throw new ProviderError('gemini', 'GEMINI_API_KEY is not set. Set it as an environment variable.');
    }
    if (!warnedOnce) {
      logger.warn('Gemini provider is an MVP-minimal implementation — revisit before production use.');
      warnedOnce = true;
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
  }

  async complete(req: AIRequest): Promise<AIResponse> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: req.userPrompt,
        config: {
          systemInstruction: req.systemPrompt,
          maxOutputTokens: req.maxTokens ?? 4096,
          temperature: req.temperature,
        },
      });

      return {
        text: response.text ?? '',
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
        model: this.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError('gemini', `request failed: ${message}`);
    }
  }

  estimateCost(usage: AIUsage): number {
    return estimateCostUsd('gemini', this.model, usage);
  }
}
