import type { ChangedFile } from '../core/types/context.js';
import type { Finding } from '../core/types/finding.js';
import { findingMarker } from './markers.js';

function isDiffAddressable(finding: Finding, changedFilesByPath: Map<string, ChangedFile>): boolean {
  if (!finding.location) return false;
  const file = changedFilesByPath.get(finding.location.file);
  if (!file) return false;
  return file.hunks.some((h) => finding.location!.startLine >= h.startLine && finding.location!.startLine <= h.endLine);
}

/**
 * Findings whose line lands inside a diff hunk of a file in this PR become
 * inline comments; everything else (repo-level findings, or a location that
 * isn't diff-addressable for whatever reason) rolls into the summary instead
 * of being posted as a broken/rejected inline comment.
 */
export function partitionFindings(findings: Finding[], changedFiles: ChangedFile[]): { inline: Finding[]; summaryOnly: Finding[] } {
  const changedFilesByPath = new Map(changedFiles.map((f) => [f.path, f]));
  const inline: Finding[] = [];
  const summaryOnly: Finding[] = [];
  for (const finding of findings) {
    (isDiffAddressable(finding, changedFilesByPath) ? inline : summaryOnly).push(finding);
  }
  return { inline, summaryOnly };
}

export function formatInlineCommentBody(finding: Finding): string {
  const lines = [
    findingMarker(finding.id),
    `**[${finding.severity}] ${finding.title}**`,
    '',
    finding.problem,
    '',
    `_Why it matters:_ ${finding.rationale}`,
  ];
  if (finding.suggestion) {
    lines.push('', `**Suggested fix:** ${finding.suggestion}`);
  }
  lines.push('', `<sub>Skill: \`${finding.skillId}\` · Confidence: ${Math.round(finding.confidence * 100)}%</sub>`);
  return lines.join('\n');
}
