import { GoogleGenAI } from '@google/genai';
import { ProviderError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { estimateCostUsd } from './pricing.js';
import type { AIProvider, AIRequest, AIResponse, AIUsage } from './provider.js';

// A stable Google-maintained alias, not a pinned version — model generations move fast (e.g.
// gemini-1.5-pro, the previous default here, was fully retired and returns a 404 as of this
// writing) and "-latest" is Google's own answer to that: it always points at their current
// recommended flash-tier model rather than requiring this codebase to chase version numbers.
const DEFAULT_MODEL = 'gemini-flash-latest';

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
    // Unlike the Anthropic SDK (`maxRetries` on the client), @google/genai does not retry
    // automatically unless `httpOptions.retryOptions` is explicitly set — confirmed via a live
    // smoke test that a bare 503 ("high demand") from Gemini surfaced as an immediate, single-
    // attempt failure with this left unset. `{}` opts into the SDK's own defaults (5 attempts).
    this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: {} } });
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
