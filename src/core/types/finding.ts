export type Severity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SUGGESTION';

export interface CodeLocation {
  file: string;
  startLine: number;
  endLine?: number;
}

export type FindingStatus = 'proposed' | 'validated' | 'rejected' | 'duplicate';

/**
 * `category` is an open string, not a closed union — skills must be able to
 * introduce new categories without a core-engine change.
 */
export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  location: CodeLocation | null;
  title: string;
  problem: string;
  rationale: string;
  suggestion?: string;
  suggestedDiff?: string;
  confidence: number;
  skillId: string;
  evidence?: string[];
  autoFixable: boolean;
  status: FindingStatus;
  rejectionReason?: string;
  /** Set later by the Fix Engine layer (Phase 8) — never by core. */
  safetyClass?: 'SAFE' | 'REVIEW_REQUIRED' | 'UNSAFE';
}
