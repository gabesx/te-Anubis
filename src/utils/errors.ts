export class PipelineStageError extends Error {
  constructor(
    public readonly stageName: string,
    public readonly cause: unknown,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Pipeline stage "${stageName}" failed: ${causeMessage}`);
    this.name = 'PipelineStageError';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}
