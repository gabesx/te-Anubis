import type {
  AppliedFix,
  FixEngine as FixEngineInterface,
  FixInput,
  FixResult,
  SkippedFix,
  SuggestedFix,
} from '../core/seams/fix-engine.js';
import { applyPatches, commitFixes, revertFiles, type FixToApply } from './git-commit-engine.js';
import { validatePatch } from './patch-validator.js';
import { runSandboxChecks } from './sandbox-runner.js';
import { classifyFixSafety } from './safety-classifier.js';

/**
 * Orchestrates: classify -> (SAFE only) validate -> apply -> sandbox-check ->
 * commit. Never commits before every prior step passes; any failure at any
 * step reverts whatever was applied in this run and reports the affected
 * findings as skipped, falling back to "suggestions" rather than silently
 * dropping them. Pushing is deliberately NOT done here — `commit.pushed` is
 * always `false`; a caller that wants to push does so as its own explicit,
 * separate step (see git-commit-engine.ts's `pushCommit`), since whether
 * that's appropriate differs between the local CLI and a GitHub PR context.
 */
export class FixEngine implements FixEngineInterface {
  async run(input: FixInput): Promise<FixResult> {
    const applied: AppliedFix[] = [];
    const suggested: SuggestedFix[] = [];
    const skipped: SkippedFix[] = [];
    const toApply: FixToApply[] = [];

    for (const finding of input.reviewResult.findings) {
      if (!finding.suggestedDiff || !finding.location) {
        continue; // no patch was proposed for this finding — nothing for the Fix Engine to do, not an error
      }

      const classification = classifyFixSafety(finding, finding.suggestedDiff);
      finding.safetyClass = classification.class;

      if (classification.class === 'UNSAFE') {
        skipped.push({ findingId: finding.id, reason: `UNSAFE — described only, never patched: ${classification.reasons.join('; ')}` });
        continue;
      }

      const eligibleForAuto = input.mode === 'fix' && classification.class === 'SAFE' && input.allowedSafetyClasses.includes('SAFE');
      if (!eligibleForAuto) {
        suggested.push({ findingId: finding.id, diff: finding.suggestedDiff });
        continue;
      }

      const validation = await validatePatch(input.repoRoot, finding.suggestedDiff, finding.location.file);
      if (!validation.valid) {
        skipped.push({ findingId: finding.id, reason: `patch failed structural validation: ${validation.reason}` });
        continue;
      }

      toApply.push({
        findingId: finding.id,
        patch: finding.suggestedDiff,
        file: finding.location.file,
        description: `${finding.category}: ${finding.title} (${finding.location.file}:${finding.location.startLine})`,
      });
    }

    if (toApply.length === 0) {
      return { applied, suggested, skipped, fallback: suggested.length > 0 ? 'suggestions' : null };
    }

    const applyResult = await applyPatches(input.repoRoot, toApply);
    if (!applyResult.applied) {
      for (const fix of toApply) {
        skipped.push({ findingId: fix.findingId, reason: applyResult.reason ?? 'failed to apply patch' });
      }
      return { applied, suggested, skipped, fallback: 'suggestions' };
    }

    const sandbox = await runSandboxChecks(input.repoRoot, applyResult.touchedFiles);
    if (!sandbox.allPassed) {
      await revertFiles(input.repoRoot, applyResult.touchedFiles);
      const failing = sandbox.checks
        .filter((c) => !c.passed)
        .map((c) => c.tool)
        .join(', ');
      for (const fix of toApply) {
        skipped.push({ findingId: fix.findingId, reason: `reverted — sandbox validation failed (${failing})` });
      }
      return { applied, suggested, skipped, fallback: 'suggestions' };
    }

    const commit = await commitFixes(input.repoRoot, toApply);
    if (!commit.committed) {
      await revertFiles(input.repoRoot, applyResult.touchedFiles);
      for (const fix of toApply) {
        skipped.push({ findingId: fix.findingId, reason: commit.reason ?? 'commit failed' });
      }
      return { applied, suggested, skipped, fallback: 'suggestions' };
    }

    for (const fix of toApply) {
      applied.push({ findingId: fix.findingId });
    }

    return { applied, suggested, skipped, commit: { sha: commit.sha!, pushed: false } };
  }
}
