const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN'];

const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-_]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
];

/** Redacts known secret formats and any literal env var values before a string
 * reaches a log line, comment, or error message. Applied at every sink, not
 * just here — this is the one shared implementation so it can't be forgotten. */
export function redact(input: string): string {
  let output = input;
  for (const envVar of SECRET_ENV_VARS) {
    const value = process.env[envVar];
    if (value) {
      output = output.split(value).join(`[REDACTED:${envVar}]`);
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = redact(meta ? `${message} ${JSON.stringify(meta)}` : message);
  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  target(`[anubis] [${level}] ${line}`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
