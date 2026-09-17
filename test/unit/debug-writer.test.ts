import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeDebugRecord } from '../../src/core/pipeline/ai-review/debug-writer.js';

describe('writeDebugRecord', () => {
  let debugDir: string;

  beforeEach(() => {
    debugDir = join(mkdtempSync(join(tmpdir(), 'anubis-debug-test-')), 'nested', 'debug-dir');
  });

  afterEach(() => {
    rmSync(debugDir, { recursive: true, force: true });
  });

  it('creates the debug directory (including nested parents) if it does not exist', () => {
    writeDebugRecord(debugDir, 0, {
      file: 'src/foo.ts',
      systemPrompt: 'system',
      userPrompt: 'user',
      responseText: 'response',
      model: 'claude-sonnet-4-5',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(readdirSync(debugDir).length).toBeGreaterThan(0);
  });

  it('writes a file whose contents round-trip the full record', () => {
    writeDebugRecord(debugDir, 0, {
      file: 'src/foo.ts',
      systemPrompt: 'the system prompt',
      userPrompt: 'the user prompt',
      responseText: '{"findings":[]}',
      model: 'claude-sonnet-4-5',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const [fileName] = readdirSync(debugDir);
    const content = JSON.parse(readFileSync(join(debugDir, fileName!), 'utf-8'));
    expect(content).toMatchObject({
      file: 'src/foo.ts',
      systemPrompt: 'the system prompt',
      userPrompt: 'the user prompt',
      responseText: '{"findings":[]}',
      model: 'claude-sonnet-4-5',
    });
  });

  it('sanitizes a file path with directory separators into a flat filename', () => {
    writeDebugRecord(debugDir, 2, {
      file: 'step-definitions/order.steps.ts',
      systemPrompt: 's',
      userPrompt: 'u',
      responseText: 'r',
      model: 'm',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const [fileName] = readdirSync(debugDir);
    expect(fileName).not.toContain('/');
    expect(fileName).toContain('step-definitions__order.steps.ts');
  });

  it('writes distinct files for different indices, never overwriting a previous record', () => {
    writeDebugRecord(debugDir, 0, { file: 'a.ts', systemPrompt: 's', userPrompt: 'u', responseText: 'first', model: 'm', usage: { inputTokens: 1, outputTokens: 1 } });
    writeDebugRecord(debugDir, 1, { file: 'b.ts', systemPrompt: 's', userPrompt: 'u', responseText: 'second', model: 'm', usage: { inputTokens: 1, outputTokens: 1 } });
    expect(readdirSync(debugDir)).toHaveLength(2);
  });
});
