/**
 * HTML-comment markers embedded in posted GitHub comments so re-runs can
 * find and update-in-place instead of reposting. Invisible when rendered.
 *
 * Both marker constants are public, hardcoded strings visible in this
 * open-source repo — anyone can post a comment containing one. Scanning
 * for markers is therefore only trustworthy when also filtered to comments
 * actually authored by the bot's own identity (see
 * GitHubIntegration.getAlreadyPostedFindingIds / upsertSummaryComment,
 * which pass every candidate through `authoredByBot`).
 */
export function findingMarker(id: string): string {
  return `<!-- anubis:finding:${id} -->`;
}

const FINDING_MARKER_PATTERN = /<!-- anubis:finding:([a-zA-Z0-9]+) -->/;

export function extractFindingId(commentBody: string): string | null {
  return FINDING_MARKER_PATTERN.exec(commentBody)?.[1] ?? null;
}

export const SUMMARY_MARKER = '<!-- anubis:summary -->';

/**
 * Findings are rendered into comment bodies verbatim except for this: any
 * text that *looks like* one of our own markers is neutralized first. This
 * defends against a successful prompt injection getting the AI to emit
 * marker-shaped text in a finding's title/problem/rationale/suggestion,
 * which would otherwise forge a marker inside an an otherwise-legitimate,
 * bot-authored comment and corrupt later idempotency scans of that same
 * comment (author-filtering alone doesn't help there, since the comment
 * really is bot-authored).
 */
export function neutralizeMarkerSyntax(text: string): string {
  return text.replace(/<!--/g, '< !--').replace(/-->/g, '-- >');
}

const MAX_AI_TEXT_LENGTH = 2000;

/** Applied to every AI-derived string embedded in a GitHub comment body: neutralizes marker
 * syntax and caps length (untrusted repo content is the ultimate source of this text, with no
 * length limit of its own). */
export function sanitizeAiText(text: string): string {
  const neutralized = neutralizeMarkerSyntax(text);
  return neutralized.length > MAX_AI_TEXT_LENGTH ? `${neutralized.slice(0, MAX_AI_TEXT_LENGTH)}… [truncated]` : neutralized;
}
