export interface DiffHunk {
  startLine: number;
  endLine: number;
  content: string;
}

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * `classification` and `language` are open strings, not closed enums — the
 * MVP only populates a known subset ('typescript' | 'javascript', 'source' |
 * 'test' | 'config' | 'docs' | 'generated'), but future language/framework
 * support must not require widening a union here.
 */
export interface ChangedFile {
  path: string;
  changeType: ChangeType;
  hunks: DiffHunk[];
  language: string;
  classification: string;
}

export interface RelatedFile {
  path: string;
  reason: 'caller' | 'test' | 'interface' | 'shared-util' | 'similar-pattern';
  excerpt: string;
}

export interface RepoManifestInfo {
  /** Detected tags, e.g. 'wdio', 'appium', 'jest' — additive, not a closed enum. */
  frameworks: string[];
  raw: Record<string, unknown>;
}

export interface ContextBundle {
  changedFile: ChangedFile;
  relatedFiles: RelatedFile[];
  repoManifest: RepoManifestInfo;
  projectInstructions?: string;
  relevantHistory?: { sha: string; message: string }[];
  tokenBudget: number;
  tokensUsed: number;
}
