import type { AnubisConfig } from './config.js';
import type { ChangedFile, ContextBundle, RepoManifestInfo } from './context.js';
import type { Finding } from './finding.js';
import type { RunMetrics, ToolCheckResult } from './review-result.js';

export interface SkillFrontmatter {
  id: string;
  name: string;
  version: string;
  appliesTo: {
    filePatterns: string[];
    frameworks?: string[];
  };
  detectionSignals?: {
    type: 'file-exists' | 'file-glob' | 'package-dependency' | 'config-key';
    value: string;
    required?: boolean;
  }[];
  defaultSeverityBias?: Record<string, Finding['severity']>;
  autoFixable: boolean;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  content: string;
  path: string;
}

export interface ResolvedSkill extends Skill {
  matchedFiles: string[];
  triggeredBy: 'auto-detect' | 'manual' | 'default';
}

export interface LintIssue {
  file: string;
  line: number;
  ruleId: string | null;
  message: string;
}

export interface PipelineContext {
  runId: string;
  repoRoot: string;
  config: AnubisConfig;
  target: { baseRef: string; headRef: string; commitSha: string; prNumber?: number };
  /** Set by repository-discovery (stage 01); consumed by context-retrieval (stage 05). */
  repoManifest?: RepoManifestInfo;
  projectInstructions?: string;
  changedFiles: ChangedFile[];
  skills: ResolvedSkill[];
  contextBundles: Map<string, ContextBundle>;
  /** Set by static-analysis-ingestion (stage 06); consumed by finding-validation (stage 08) to reject findings that just restate an existing lint error. */
  lintIssues: LintIssue[];
  validation: { lint?: ToolCheckResult; typecheck?: ToolCheckResult; tests?: ToolCheckResult };
  /** The actual model string a provider reported back (stage 07) — may differ from config.ai.model when that was left unset and the provider picked its own default. */
  actualModelUsed?: string;
  /** When set, ai-review (stage 07) writes each request/response pair to this local directory —
   * the `--debug` escape hatch for inspecting raw prompts without them ever reaching stdout,
   * a report, or a posted comment. Unset (the default) writes nothing. */
  debugDir?: string;
  rawFindings: Finding[];
  findings: Finding[];
  filesSkipped: string[];
  metrics: RunMetrics;
}

export interface ReviewPipelineStage {
  name: string;
  run(ctx: PipelineContext): Promise<PipelineContext>;
}
