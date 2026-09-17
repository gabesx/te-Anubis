import type { Finding, Severity } from './finding.js';

export interface ToolCheckResult {
  tool: string;
  passed: boolean;
  summary: string;
}

export interface RunMetrics {
  llmRequests: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  durationMs: number;
  findingsGenerated: number;
  findingsRejected: number;
  findingsFinal: number;
  stageDurations: Record<string, number>;
}

/**
 * The seam CLI reporters (MVP) and, later, GitHub review posting and the Fix
 * Engine all build on top of.
 */
export interface ReviewResult {
  runId: string;
  repo: { root: string; remoteUrl?: string };
  target: { baseRef: string; headRef: string; commitSha: string; prNumber?: number };
  provider: { name: string; model: string };
  skillsUsed: string[];
  findings: Finding[];
  summary: {
    countsBySeverity: Record<Severity, number>;
    filesAnalyzed: number;
    filesSkipped: number;
  };
  validation: {
    lint?: ToolCheckResult;
    typecheck?: ToolCheckResult;
    tests?: ToolCheckResult;
  };
  metrics: RunMetrics;
  generatedAt: string;
}
