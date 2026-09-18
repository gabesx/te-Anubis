import { ConfigError } from '../../utils/errors.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { PROVIDER_ENV_VARS, type AIProvider, type ProviderName } from './provider.js';

/**
 * The only place that knows about concrete providers. Nothing in
 * core/pipeline or core/validation imports a concrete provider — switching
 * `ai.provider` is a config change resolved here.
 */
export function createProvider(name: ProviderName, model?: string): AIProvider {
  const apiKey = process.env[PROVIDER_ENV_VARS[name]] ?? '';
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    default: {
      const exhaustiveCheck: never = name;
      throw new ConfigError(`Unknown AI provider: ${String(exhaustiveCheck)}`);
    }
  }
}
