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
