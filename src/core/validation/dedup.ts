import type { Finding } from '../types/finding.js';

function normalizeWords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const NEAR_DUPLICATE_LINE_DISTANCE = 2;
const NEAR_DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

/** Same file, nearby line, and similar wording (Jaccard over the "problem" text) —
 * catches two skills (or two batches) independently flagging the same real issue. */
function isNearDuplicate(a: Finding, b: Finding): boolean {
  if (!a.location || !b.location) return false;
  if (a.location.file !== b.location.file) return false;
  if (Math.abs(a.location.startLine - b.location.startLine) > NEAR_DUPLICATE_LINE_DISTANCE) return false;
  return jaccardSimilarity(normalizeWords(a.problem), normalizeWords(b.problem)) >= NEAR_DUPLICATE_SIMILARITY_THRESHOLD;
}

function preferBetter(a: Finding, b: Finding): Finding {
  return b.confidence > a.confidence ? b : a;
}

/**
 * Two passes: exact-ID collisions first (the same finding produced twice,
 * e.g. by two overlapping skill matches), then a near-duplicate merge over
 * what remains. Both keep the higher-confidence finding rather than
 * concatenating or picking arbitrarily.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byId.get(finding.id);
    byId.set(finding.id, existing ? preferBetter(existing, finding) : finding);
  }

  const deduped: Finding[] = [];
  for (const finding of byId.values()) {
    const duplicateIndex = deduped.findIndex((existing) => isNearDuplicate(existing, finding));
    if (duplicateIndex === -1) {
      deduped.push(finding);
    } else {
      deduped[duplicateIndex] = preferBetter(deduped[duplicateIndex]!, finding);
    }
  }
  return deduped;
}
