const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
};

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

export function detectLanguage(path: string): string {
  return LANGUAGE_BY_EXTENSION[extensionOf(path)] ?? 'unknown';
}

const TEST_PATH_PATTERNS = [/\.(spec|test|steps)\.[jt]sx?$/, /(^|\/)__tests__\//, /(^|\/)(test|tests|features|step-definitions)\//];

const CONFIG_PATH_PATTERNS = [
  /(^|\/)(package\.json|tsconfig.*\.json|\.eslintrc.*|eslint\.config\.[mc]?js|wdio\.conf\.[jt]s|\.env.*|\.anubis\.ya?ml)$/,
];

const DOCS_PATH_PATTERNS = [/\.md$/i, /(^|\/)docs\//];

const GENERATED_PATH_PATTERNS = [/(^|\/)(dist|build|coverage|generated|\.next|node_modules)\//, /\.d\.ts$/, /(^|\/)package-lock\.json$/];

/**
 * Heuristic, path-based classification — good enough to steer context
 * retrieval and noise reduction without a real per-language AST/build-tool
 * integration (out of scope for the MVP's TS/JS+WDIO focus).
 */
export function classifyFile(path: string): string {
  if (GENERATED_PATH_PATTERNS.some((p) => p.test(path))) return 'generated';
  if (CONFIG_PATH_PATTERNS.some((p) => p.test(path))) return 'config';
  if (DOCS_PATH_PATTERNS.some((p) => p.test(path))) return 'docs';
  if (TEST_PATH_PATTERNS.some((p) => p.test(path))) return 'test';
  return 'source';
}
