import { redact } from '../../utils/logger.js';
import type { Reporter } from './reporter.js';
import type { ReviewResult } from '../types/review-result.js';
import type { Severity } from '../types/finding.js';

const SEVERITY_ORDER: Severity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'SUGGESTION'];

function formatFinding(finding: ReviewResult['findings'][number]): string {
  const location = finding.location ? `${finding.location.file}:${finding.location.startLine}` : '(repo-level)';
  const lines = [
    `[${finding.severity}] ${finding.title}`,
    '',
    `File:`,
    location,
    '',
    `Problem:`,
    finding.problem,
    '',
    `Why it matters:`,
    finding.rationale,
  ];
  if (finding.suggestion) {
    lines.push('', 'Suggested fix:', finding.suggestion);
  }
  lines.push('', `Skill: ${finding.skillId}`, `Confidence: ${Math.round(finding.confidence * 100)}%`);
  return lines.join('\n');
}

function buildReport(result: ReviewResult): string {
  const lines: string[] = ['## 🐺 Anubis Review\n'];

  lines.push(
    `Analyzed:\n${result.summary.filesAnalyzed} changed files` +
      (result.summary.filesSkipped > 0 ? ` (${result.summary.filesSkipped} skipped)` : ''),
  );
  lines.push(`\nSkills:\n${result.skillsUsed.length > 0 ? result.skillsUsed.map((s) => `- ${s}`).join('\n') : '(none matched)'}`);
  lines.push('\nFindings:\n');
  for (const severity of SEVERITY_ORDER) {
    lines.push(`${severity}: ${result.summary.countsBySeverity[severity]}`);
  }

  if (result.findings.length > 0) {
    lines.push('\n### Findings\n');
    for (const finding of result.findings) {
      lines.push(formatFinding(finding));
      lines.push('\n---\n');
    }
  }

  const checks = [result.validation.lint, result.validation.typecheck, result.validation.tests].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );
  if (checks.length > 0) {
    lines.push('\n### Validation\n');
    for (const check of checks) {
      lines.push(`${check.passed ? '✓' : '⚠'} ${check.tool}: ${check.summary}`);
    }
  }

  lines.push(`\nProvider: ${result.provider.name} (${result.provider.model})`);

  const m = result.metrics;
  lines.push(
    `\nRun: ${m.durationMs}ms · ${m.llmRequests} request(s) · ${m.tokensIn}+${m.tokensOut} tokens · ~$${m.estimatedCostUsd.toFixed(4)}`,
  );

  return lines.join('\n');
}

export const cliReporter: Reporter = {
  render(result: ReviewResult): void {
    // Built as one string and redacted once, rather than redacting each console.log call
    // individually — a single sink that's easy to verify covers everything, not N of them.
    console.log(redact(buildReport(result)));
  },
};
