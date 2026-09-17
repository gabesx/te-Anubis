import { z } from 'zod';
import { stableHash } from '../../../utils/hash.js';
import type { Finding } from '../../types/finding.js';

const SeveritySchema = z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'SUGGESTION']);

const AIFindingSchema = z.object({
  severity: SeveritySchema,
  category: z.string().min(1),
  title: z.string().min(1),
  problem: z.string().min(1),
  rationale: z.string().min(1),
  suggestion: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  line: z.number().int().positive().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  skillId: z.string().min(1),
});

const AIResponseSchema = z.object({
  findings: z.array(AIFindingSchema),
});

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch?.[1] ?? trimmed;
}

export interface ParseFindingsOptions {
  filePath: string;
  /** skillId -> that skill's autoFixable default. Findings naming a skillId not in this map are dropped —
   * an unrecognized skill id is either a hallucination or (in the adversarial case) a prompt-injection
   * attempt to misattribute a finding, neither of which should be accepted at face value. */
  allowedSkills: Map<string, boolean>;
}

/**
 * Parses one AI response into Finding[]. Malformed JSON, a schema mismatch,
 * or an individual finding naming an unrecognized skill are all handled by
 * dropping what's invalid rather than throwing — one bad response shouldn't
 * take down the whole review run.
 */
export function parseFindings(responseText: string, options: ParseFindingsOptions): Finding[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(responseText));
  } catch {
    return [];
  }

  const result = AIResponseSchema.safeParse(raw);
  if (!result.success) return [];

  return result.data.findings
    .filter((f) => options.allowedSkills.has(f.skillId))
    .map((f): Finding => {
      const location = f.line ? { file: options.filePath, startLine: f.line } : null;
      return {
        id: stableHash([options.filePath, f.line ?? null, f.category, f.title]),
        severity: f.severity,
        category: f.category,
        location,
        title: f.title,
        problem: f.problem,
        rationale: f.rationale,
        suggestion: f.suggestion ?? undefined,
        confidence: f.confidence,
        skillId: f.skillId,
        evidence: f.evidence,
        autoFixable: options.allowedSkills.get(f.skillId) ?? false,
        status: 'proposed',
      };
    });
}
