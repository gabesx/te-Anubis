import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DebugRecord {
  file: string;
  systemPrompt: string;
  userPrompt: string;
  responseText: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Writes one AI request/response pair to a local-only debug file — never
 * stdout, never uploaded anywhere. This is the sanctioned escape hatch for
 * inspecting exactly what was sent to/received from the provider without
 * violating the "never leak raw prompts" requirement everywhere else
 * (reports, GitHub comments, logs). Prompts don't contain secrets (API keys
 * are read directly from env by the provider client, never interpolated
 * into prompt text), so this is safe to write unredacted — the risk this
 * guards against is exposure via a *shared* sink (stdout in CI, a posted
 * comment), not the content itself.
 */
export function writeDebugRecord(debugDir: string, index: number, record: DebugRecord): void {
  mkdirSync(debugDir, { recursive: true });
  const safeName = record.file.replace(/[/\\]/g, '__');
  const path = join(debugDir, `${String(index).padStart(3, '0')}-${safeName}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
}
