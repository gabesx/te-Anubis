import type { Finding, Severity } from '../core/types/finding.js';
import type { ReviewResult } from '../core/types/review-result.js';
import { SUMMARY_MARKER } from './markers.js';

const SEVERITY_ORDER: Severity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'SUGGESTION'];

/**
 * Matches the spec's example summary format. Never includes raw prompts,
 * chain-of-thought, secrets, or env values — only structured `ReviewResult`
 * fields, template-rendered.
 */
export function formatSummaryComment(result: ReviewResult, summaryOnlyFindings: Finding[]): string {
  const lines = [
    SUMMARY_MARKER,
    '## 🐺 Anubis Review',
    '',
    'Analyzed:',
    `${result.summary.filesAnalyzed} changed files` + (result.summary.filesSkipped > 0 ? ` (${result.summary.filesSkipped} skipped)` : ''),
    '',
    'Skills:',
    ...(result.skillsUsed.length > 0 ? result.skillsUsed.map((s) => `- ${s}`) : ['(none matched)']),
    '',
    'Findings:',
    '',
    ...SEVERITY_ORDER.map((s) => `${s}: ${result.summary.countsBySeverity[s]}`),
  ];

  if (summaryOnlyFindings.length > 0) {
    lines.push('', '### Repo-level / cross-file findings', '');
    for (const f of summaryOnlyFindings) {
      lines.push(`- **[${f.severity}]** ${f.title} — ${f.problem}`);
    }
  }

  const checks = [result.validation.lint, result.validation.typecheck, result.validation.tests].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );
  if (checks.length > 0) {
    lines.push('', '### Validation', '');
    for (const check of checks) {
      lines.push(`${check.passed ? '✓' : '⚠'} ${check.tool}: ${check.summary}`);
    }
  }

  lines.push('', `Provider: ${result.provider.name} (${result.provider.model})`);
  return lines.join('\n');
}
