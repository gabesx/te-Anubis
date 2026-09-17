import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const anthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
  },
}));

const { runPipeline } = await import('../../src/core/pipeline/pipeline.js');
const { PIPELINE_STAGES } = await import('../../src/cli/commands/pipeline-stages.js');
const { buildReviewResult } = await import('../../src/core/reporting/build-review-result.js');
const { loadConfig } = await import('../../src/cli/config/load-config.js');
type PipelineContext = import('../../src/core/types/pipeline.js').PipelineContext;

async function setUpRepo(): Promise<string> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'anubis-e2e-test-'));
  mkdirSync(join(repoRoot, 'step-definitions'), { recursive: true });

  writeFileSync(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'e2e-fixture', devDependencies: { '@wdio/cli': '^8.0.0', axios: '^1.6.0' } }, null, 2),
  );
  writeFileSync(join(repoRoot, 'wdio.conf.ts'), "export const config = { framework: 'cucumber' };\n");
  writeFileSync(
    join(repoRoot, 'step-definitions', 'order.steps.ts'),
    "import axios from 'axios';\n\nexport async function createOrder() {\n  await axios.post('/orders', {});\n}\n",
  );

  const git = simpleGit(repoRoot);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Anubis Test');
  await git.add('.');
  await git.commit('initial commit');

  writeFileSync(
    join(repoRoot, 'step-definitions', 'order.steps.ts'),
    "import axios from 'axios';\n\nexport async function createOrder() {\n  const response = await axios.post('/orders', {});\n  return response;\n}\n",
  );
  await git.add('.');
  await git.commit('return response without asserting status');

  return repoRoot;
}

function buildInitialContext(repoRoot: string): PipelineContext {
  const config = loadConfig(repoRoot);
  return {
    runId: randomUUID(),
    repoRoot,
    config,
    target: { baseRef: 'HEAD~1', headRef: 'HEAD', commitSha: '' },
    changedFiles: [],
    skills: [],
    contextBundles: new Map(),
    lintIssues: [],
    validation: {},
    rawFindings: [],
    findings: [],
    filesSkipped: [],
    metrics: {
      llmRequests: 0,
      tokensIn: 0,
      tokensOut: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      findingsGenerated: 0,
      findingsRejected: 0,
      findingsFinal: 0,
      stageDurations: {},
    },
  };
}

describe('full review pipeline (end-to-end, mocked AI provider)', () => {
  let repoRoot: string;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(async () => {
    repoRoot = await setUpRepo();
    process.env.ANTHROPIC_API_KEY = 'fake-key-for-tests';
    anthropicCreate.mockReset();
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    process.env.ANTHROPIC_API_KEY = originalApiKey;
  });

  it('auto-detects the API skill, reviews the changed file, and produces a validated finding', async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            findings: [
              {
                severity: 'HIGH',
                category: 'missing-validation',
                title: 'Response status is never asserted',
                problem: 'createOrder returns the response but never checks its status code.',
                rationale: 'A backend regression could occur while this still reports success.',
                suggestion: 'Assert response.status before returning it.',
                confidence: 0.9,
                line: 4,
                evidence: [],
                skillId: 'review-wdio-api-automation',
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 500, output_tokens: 120 },
      model: 'claude-sonnet-4-5',
    });

    const ctx = buildInitialContext(repoRoot);
    const finalContext = await runPipeline(PIPELINE_STAGES, ctx);
    finalContext.metrics.findingsFinal = finalContext.findings.length;

    const result = buildReviewResult(finalContext);

    expect(result.skillsUsed.sort()).toEqual(['code-convention', 'review-wdio-api-automation']);
    expect(result.summary.filesAnalyzed).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: 'HIGH',
      skillId: 'review-wdio-api-automation',
      status: 'validated',
      location: { file: 'step-definitions/order.steps.ts', startLine: 4 },
    });
    expect(result.metrics.llmRequests).toBeGreaterThan(0);
    expect(result.provider.model).toBe('claude-sonnet-4-5');
  });

  it('rejects a low-confidence finding via the validator instead of reporting it', async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            findings: [
              {
                severity: 'LOW',
                category: 'speculative',
                title: 'Maybe an issue',
                problem: 'This might be a problem, unclear.',
                rationale: 'Not sure.',
                suggestion: 'Consider looking into it.',
                confidence: 0.2,
                line: 4,
                skillId: 'review-wdio-api-automation',
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 400, output_tokens: 80 },
      model: 'claude-sonnet-4-5',
    });

    const ctx = buildInitialContext(repoRoot);
    const finalContext = await runPipeline(PIPELINE_STAGES, ctx);
    const result = buildReviewResult(finalContext);

    expect(result.findings).toHaveLength(0);
    expect(finalContext.metrics.findingsRejected).toBeGreaterThan(0);
  });
});
