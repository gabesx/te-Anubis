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

export const cliReporter: Reporter = {
  render(result: ReviewResult): void {
    console.log('## 🐺 Anubis Review\n');
    console.log(
      `Analyzed:\n${result.summary.filesAnalyzed} changed files` +
        (result.summary.filesSkipped > 0 ? ` (${result.summary.filesSkipped} skipped)` : ''),
    );
    console.log(`\nSkills:\n${result.skillsUsed.length > 0 ? result.skillsUsed.map((s) => `- ${s}`).join('\n') : '(none matched)'}`);
    console.log('\nFindings:\n');
    for (const severity of SEVERITY_ORDER) {
      console.log(`${severity}: ${result.summary.countsBySeverity[severity]}`);
    }

    if (result.findings.length > 0) {
      console.log('\n### Findings\n');
      for (const finding of result.findings) {
        console.log(formatFinding(finding));
        console.log('\n---\n');
      }
    }

    const checks = [result.validation.lint, result.validation.typecheck, result.validation.tests].filter(
      (c): c is NonNullable<typeof c> => c !== undefined,
    );
    if (checks.length > 0) {
      console.log('\n### Validation\n');
      for (const check of checks) {
        console.log(`${check.passed ? '✓' : '⚠'} ${check.tool}: ${check.summary}`);
      }
    }

    console.log(`\nProvider: ${result.provider.name} (${result.provider.model})`);
  },
};
