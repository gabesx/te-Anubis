import type { FixResult } from '../seams/fix-engine.js';
import type { Finding } from '../types/finding.js';

/** Human-readable rendering of a FixResult, printed after the normal review report
 * when `--fix`/`--suggest-fixes` is used. Never claims a fix was applied when it wasn't. */
export function formatFixResult(fixResult: FixResult, findingsById: Map<string, Finding>): string {
  const lines: string[] = ['', '## 🔧 Fix Engine', ''];

  if (fixResult.applied.length > 0) {
    lines.push(`Applied and committed ${fixResult.applied.length} SAFE fix(es):`);
    for (const { findingId } of fixResult.applied) {
      const finding = findingsById.get(findingId);
      lines.push(`  - ${finding?.title ?? findingId}`);
    }
    if (fixResult.commit) {
      lines.push('', `Commit: ${fixResult.commit.sha}${fixResult.commit.pushed ? ' (pushed)' : ' (not pushed)'}`);
    }
  }

  if (fixResult.suggested.length > 0) {
    lines.push('', `${fixResult.suggested.length} finding(s) have a proposed fix but require human review (REVIEW_REQUIRED or --suggest-fixes mode):`);
    for (const { findingId } of fixResult.suggested) {
      const finding = findingsById.get(findingId);
      lines.push(`  - [${finding?.safetyClass ?? '?'}] ${finding?.title ?? findingId}`);
    }
  }

  if (fixResult.skipped.length > 0) {
    lines.push('', `${fixResult.skipped.length} finding(s) were not auto-fixed:`);
    for (const { findingId, reason } of fixResult.skipped) {
      const finding = findingsById.get(findingId);
      lines.push(`  - ${finding?.title ?? findingId}: ${reason}`);
    }
  }

  if (fixResult.applied.length === 0 && fixResult.suggested.length === 0 && fixResult.skipped.length === 0) {
    lines.push('No findings had a proposed patch to act on.');
  }

  return lines.join('\n');
}
