import parseDiff from 'parse-diff';
import type { Finding } from '../core/types/finding.js';
import { matchesSecurityDenylist } from './denylist.js';

export type SafetyClass = 'SAFE' | 'REVIEW_REQUIRED' | 'UNSAFE';

export interface SafetyClassification {
  class: SafetyClass;
  reasons: string[];
}

const CONFIDENCE_THRESHOLD_FOR_SAFE = 0.85;
const MAX_SAFE_DIFF_CHANGED_LINES = 30;

function allLinesOfType(changes: parseDiff.Change[], type: 'add' | 'del'): string[] {
  return changes.filter((c) => c.type === type).map((c) => c.content.slice(1)); // strip the leading +/-
}

/**
 * Positional comparison, deliberately NOT a sorted-multiset comparison: sorting before
 * comparing would treat a statement-*reorder* (e.g. swapping two lines, which can be a real
 * behavioral change — order-dependent side effects, lock-before-use) as "the same lines,
 * therefore whitespace-only." Line N removed must equal line N added, in place.
 */
function isWhitespaceOnly(changes: parseDiff.Change[]): boolean {
  const added = allLinesOfType(changes, 'add').map((l) => l.trim());
  const removed = allLinesOfType(changes, 'del').map((l) => l.trim());
  if (added.length !== removed.length) return false;
  return added.every((line, i) => line === removed[i]);
}

const IMPORT_LINE_PATTERN = /^\s*import\s.+;?\s*$/;

function isUnusedImportRemovalOnly(changes: parseDiff.Change[]): boolean {
  const added = allLinesOfType(changes, 'add');
  const removed = allLinesOfType(changes, 'del');
  if (added.length > 0 || removed.length === 0) return false;
  return removed.every((line) => IMPORT_LINE_PATTERN.test(line));
}

const ASSERTION_LINE_PATTERN = /^\s*(expect|assert|should)\s*[(.]/;

function isAssertionAdditionOnly(changes: parseDiff.Change[]): boolean {
  const added = allLinesOfType(changes, 'add').filter((l) => l.trim().length > 0);
  const removed = allLinesOfType(changes, 'del');
  if (added.length === 0 || removed.length > 0) return false;
  return added.every((line) => ASSERTION_LINE_PATTERN.test(line));
}

/**
 * Rule-based only (no AI self-assessment input) — the deterministic,
 * auditable, testable rule set here is the entire gate. This is a stricter
 * simplification than a hybrid rule+AI-advisory design: since AI opinion can
 * only ever tighten a classification (never loosen it below the rule floor,
 * per the design), omitting it entirely is still a safe subset of allowed
 * behavior — it just means we don't get the extra tightening signal.
 * Unmatched/unusual diff shapes fail closed to REVIEW_REQUIRED.
 */
export function classifyFixSafety(finding: Finding, patch: string): SafetyClassification {
  const reasons: string[] = [];
  const file = finding.location?.file ?? '';

  if (matchesSecurityDenylist(file)) {
    return { class: 'UNSAFE', reasons: [`file path "${file}" matches a denylisted (secrets/CI/auth/payment) pattern`] };
  }

  if (finding.confidence < CONFIDENCE_THRESHOLD_FOR_SAFE) {
    reasons.push(`confidence ${finding.confidence} is below the ${CONFIDENCE_THRESHOLD_FOR_SAFE} bar required for auto-commit`);
  }

  let files: parseDiff.File[];
  try {
    files = parseDiff(patch);
  } catch {
    return { class: 'REVIEW_REQUIRED', reasons: ['patch could not be parsed as a unified diff'] };
  }

  if (files.length !== 1) {
    return { class: 'REVIEW_REQUIRED', reasons: [`patch touches ${files.length} files; SAFE fixes are scoped to exactly one`] };
  }

  const allChanges = files[0]!.chunks.flatMap((c) => c.changes);
  const changedLineCount = allChanges.filter((c) => c.type !== 'normal').length;
  if (changedLineCount > MAX_SAFE_DIFF_CHANGED_LINES) {
    return { class: 'REVIEW_REQUIRED', reasons: [`diff changes ${changedLineCount} lines, over the ${MAX_SAFE_DIFF_CHANGED_LINES}-line SAFE cap`] };
  }

  const shapeReasons: string[] = [];
  if (isWhitespaceOnly(allChanges)) shapeReasons.push('whitespace/formatting-only change');
  if (isUnusedImportRemovalOnly(allChanges)) shapeReasons.push('removes only import statements');
  if (isAssertionAdditionOnly(allChanges)) shapeReasons.push('adds only assertion call(s)');

  if (shapeReasons.length === 0) {
    return { class: 'REVIEW_REQUIRED', reasons: ['diff does not match any recognized SAFE-eligible shape (fail-closed default)'] };
  }

  if (reasons.length > 0) {
    // Shape-eligible, but the confidence gate above still applies.
    return { class: 'REVIEW_REQUIRED', reasons };
  }

  return { class: 'SAFE', reasons: shapeReasons };
}
