export interface AnubisConfig {
  version: number;
  ai: {
    provider: 'anthropic' | 'openai' | 'gemini';
    model?: string;
  };
  review: {
    minimumConfidence: number;
    maxComments: number;
    maxFiles: number;
  };
  skills: {
    autoDetect: boolean;
    enabled: string[];
  };
  github: {
    inlineComments: boolean;
    summary: boolean;
  };
  fix: {
    enabled: boolean;
    autoCommit: boolean;
    allowed: ('SAFE' | 'REVIEW_REQUIRED' | 'UNSAFE')[];
  };
}
