import type { ChangedFile } from '../types/context.js';
import type { Finding } from '../types/finding.js';
import type { LintIssue } from '../types/pipeline.js';

export interface ValidateFindingsOptions {
  changedFilesByPath: Map<string, ChangedFile>;
  lintIssues: LintIssue[];
  minimumConfidence: number;
}

function isWithinDiffHunks(finding: Finding, changedFile: ChangedFile): boolean {
  if (!finding.location) return false;
  return changedFile.hunks.some((h) => finding.location!.startLine >= h.startLine && finding.location!.startLine <= h.endLine);
}

/** A finding either points at a line the diff actually touches, or explicitly cites
 * evidence for why a line outside the diff is still relevant (a pre-existing issue
 * the change exposes) — an ungrounded claim with neither is rejected. */
function passesLocationGate(finding: Finding, changedFile: ChangedFile | undefined): boolean {
  if (finding.evidence && finding.evidence.length > 0) return true;
  if (!changedFile) return false;
  return isWithinDiffHunks(finding, changedFile);
}

/** Loose (±1 line) match against the project's own lint output — the AI review stage
 * is told not to restate lint errors, but this is the actual enforcement of that rule. */
function restatesLintIssue(finding: Finding, lintIssues: LintIssue[]): boolean {
  if (!finding.location) return false;
  return lintIssues.some((issue) => issue.file === finding.location!.file && Math.abs(issue.line - finding.location!.startLine) <= 1);
}

/**
 * Rule-based-only for MVP: an LLM-assisted second validation pass is a
 * documented fast-follow (plan Phase 7.1), not built here. Every gate below
 * is independently testable and produces a `rejectionReason` for
 * observability — rejected findings are kept (status flipped), not deleted,
 * so a later stage/report can account for them without re-deriving why.
 */
export function validateFindings(findings: Finding[], options: ValidateFindingsOptions): Finding[] {
  return findings.map((finding): Finding => {
    const changedFile = finding.location ? options.changedFilesByPath.get(finding.location.file) : undefined;

    if (!passesLocationGate(finding, changedFile)) {
      return { ...finding, status: 'rejected', rejectionReason: 'not grounded in the diff (no matching hunk line and no cited evidence)' };
    }
    if (finding.category.trim().length === 0) {
      return { ...finding, status: 'rejected', rejectionReason: 'missing category' };
    }
    if (finding.confidence < options.minimumConfidence) {
      return { ...finding, status: 'rejected', rejectionReason: `confidence ${finding.confidence} below minimum ${options.minimumConfidence}` };
    }
    if (restatesLintIssue(finding, options.lintIssues)) {
      return { ...finding, status: 'rejected', rejectionReason: 'restates an existing lint error' };
    }
    if (!finding.suggestion || finding.suggestion.trim().length === 0) {
      return { ...finding, status: 'rejected', rejectionReason: 'no actionable suggestion' };
    }
    return { ...finding, status: 'validated' };
  });
}
