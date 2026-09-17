import type { Finding, Severity } from '../types/finding.js';
import type { ResolvedSkill } from '../types/pipeline.js';

const DEFAULT_SEVERITY_BY_CATEGORY: Record<string, Severity> = {
  security: 'BLOCKER',
  'prompt-injection-suspected': 'HIGH',
  bug: 'HIGH',
  regression: 'HIGH',
  'race-condition': 'HIGH',
  'missing-test': 'HIGH',
  'error-handling': 'MEDIUM',
  'flaky-test': 'MEDIUM',
  'test-isolation': 'MEDIUM',
  'retry-abuse': 'MEDIUM',
  'weak-assertion': 'LOW',
  'code-convention': 'LOW',
  maintainability: 'LOW',
  'duplicated-implementation': 'SUGGESTION',
};

/**
 * A skill's own `defaultSeverityBias` wins when it names this finding's
 * category; otherwise a small built-in per-category default; otherwise the
 * AI's own originally-assigned severity is left as-is — neither table having
 * an opinion isn't a reason to override the model.
 */
export function classifySeverity(finding: Finding, skillsById: Map<string, ResolvedSkill>): Severity {
  const skillBias = skillsById.get(finding.skillId)?.frontmatter.defaultSeverityBias?.[finding.category];
  if (skillBias) return skillBias;

  const defaultBias = DEFAULT_SEVERITY_BY_CATEGORY[finding.category];
  if (defaultBias) return defaultBias;

  return finding.severity;
}

export function applySeverityClassification(findings: Finding[], skills: ResolvedSkill[]): Finding[] {
  const skillsById = new Map(skills.map((s) => [s.frontmatter.id, s]));
  return findings.map((finding) => ({ ...finding, severity: classifySeverity(finding, skillsById) }));
}
