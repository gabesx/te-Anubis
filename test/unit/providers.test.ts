import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/utils/errors.js';

const anthropicCreate = vi.fn();
const openaiCreate = vi.fn();
const geminiGenerateContent = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
  },
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openaiCreate } };
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: geminiGenerateContent };
  },
}));

const { AnthropicProvider } = await import('../../src/core/providers/anthropic-provider.js');
const { OpenAIProvider } = await import('../../src/core/providers/openai-provider.js');
const { GeminiProvider } = await import('../../src/core/providers/gemini-provider.js');

const SAMPLE_REQUEST = { systemPrompt: 'you are a reviewer', userPrompt: 'review this diff' };

describe('AnthropicProvider', () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
  });

  it('throws a clean ProviderError when no API key is configured', () => {
    expect(() => new AnthropicProvider('')).toThrow(ProviderError);
  });

  it('parses a completion response into the common AIResponse shape', async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'looks good' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-sonnet-4-5',
    });

    const provider = new AnthropicProvider('fake-key');
    const result = await provider.complete(SAMPLE_REQUEST);

    expect(result.text).toBe('looks good');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.model).toBe('claude-sonnet-4-5');
  });

  it('wraps SDK failures in a ProviderError instead of leaking the raw error', async () => {
    anthropicCreate.mockRejectedValue(new Error('rate limited'));
    const provider = new AnthropicProvider('fake-key');
    await expect(provider.complete(SAMPLE_REQUEST)).rejects.toThrow(ProviderError);
  });

  it('estimates cost proportionally to token usage', () => {
    const provider = new AnthropicProvider('fake-key', 'claude-sonnet-4-5');
    const small = provider.estimateCost({ inputTokens: 1_000_000, outputTokens: 0 });
    const large = provider.estimateCost({ inputTokens: 2_000_000, outputTokens: 0 });
    expect(large).toBeCloseTo(small * 2, 5);
    expect(small).toBeGreaterThan(0);
  });
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    openaiCreate.mockReset();
  });

  it('throws a clean ProviderError when no API key is configured', () => {
    expect(() => new OpenAIProvider('')).toThrow(ProviderError);
  });

  it('parses a chat completion response into the common AIResponse shape', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: 'ship it' } }],
      usage: { prompt_tokens: 30, completion_tokens: 12 },
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('fake-key');
    const result = await provider.complete(SAMPLE_REQUEST);

    expect(result.text).toBe('ship it');
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
    expect(result.model).toBe('gpt-4o');
  });

  it('wraps SDK failures in a ProviderError', async () => {
    openaiCreate.mockRejectedValue(new Error('boom'));
    const provider = new OpenAIProvider('fake-key');
    await expect(provider.complete(SAMPLE_REQUEST)).rejects.toThrow(ProviderError);
  });
});

describe('GeminiProvider', () => {
  beforeEach(() => {
    geminiGenerateContent.mockReset();
  });

  it('throws a clean ProviderError when no API key is configured', () => {
    expect(() => new GeminiProvider('')).toThrow(ProviderError);
  });

  it('parses a generateContent response into the common AIResponse shape', async () => {
    geminiGenerateContent.mockResolvedValue({
      text: 'approved',
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 15 },
    });

    const provider = new GeminiProvider('fake-key');
    const result = await provider.complete(SAMPLE_REQUEST);

    expect(result.text).toBe('approved');
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 15 });
  });

  it('wraps SDK failures in a ProviderError', async () => {
    geminiGenerateContent.mockRejectedValue(new Error('boom'));
    const provider = new GeminiProvider('fake-key');
    await expect(provider.complete(SAMPLE_REQUEST)).rejects.toThrow(ProviderError);
  });
});
