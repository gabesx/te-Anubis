/**
 * HTML-comment markers embedded in posted GitHub comments so re-runs can
 * find and update-in-place instead of reposting. Invisible when rendered.
 */
export function findingMarker(id: string): string {
  return `<!-- anubis:finding:${id} -->`;
}

const FINDING_MARKER_PATTERN = /<!-- anubis:finding:([a-zA-Z0-9]+) -->/;

export function extractFindingId(commentBody: string): string | null {
  return FINDING_MARKER_PATTERN.exec(commentBody)?.[1] ?? null;
}

export const SUMMARY_MARKER = '<!-- anubis:summary -->';
