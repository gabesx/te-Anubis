import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, ProviderError } from '../../src/utils/errors.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: vi.fn() };
  },
}));

const { createProvider } = await import('../../src/core/providers/provider-factory.js');
const { AnthropicProvider } = await import('../../src/core/providers/anthropic-provider.js');
const { OpenAIProvider } = await import('../../src/core/providers/openai-provider.js');
const { GeminiProvider } = await import('../../src/core/providers/gemini-provider.js');

describe('createProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key';
    process.env.OPENAI_API_KEY = 'fake-openai-key';
    process.env.GEMINI_API_KEY = 'fake-gemini-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves "anthropic" to an AnthropicProvider using the env var key', () => {
    const provider = createProvider('anthropic');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('resolves "openai" to an OpenAIProvider using the env var key', () => {
    const provider = createProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('resolves "gemini" to a GeminiProvider using the env var key', () => {
    const provider = createProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe('gemini');
  });

  it('surfaces a clean ProviderError, not a stack trace, when the relevant key is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createProvider('anthropic')).toThrow(ProviderError);
  });

  it('rejects an unrecognized provider name at runtime with a ConfigError', () => {
    // @ts-expect-error deliberately bypassing the type system to exercise the runtime guard
    expect(() => createProvider('not-a-real-provider')).toThrow(ConfigError);
  });
});
