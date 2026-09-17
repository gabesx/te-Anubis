import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRelatedFiles } from '../../src/core/context/related-file-finder.js';
import { probeRepo } from '../../src/core/repo/manifest-reader.js';

describe('findRelatedFiles', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'anubis-related-files-test-'));
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'order-service.ts'), 'export function createOrder() {}\n');
    writeFileSync(
      join(repoRoot, 'src', 'order-service.spec.ts'),
      "import { createOrder } from './order-service';\ntest('creates an order', () => {});\n",
    );
    writeFileSync(
      join(repoRoot, 'src', 'checkout.ts'),
      "import { createOrder } from './order-service';\nexport function checkout() { createOrder(); }\n",
    );
    writeFileSync(join(repoRoot, 'src', 'unrelated.ts'), 'export const answer = 42;\n');
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('finds a naming-convention test file for the changed file', () => {
    const probe = probeRepo(repoRoot);
    const related = findRelatedFiles('src/order-service.ts', probe);
    expect(related.some((r) => r.path === 'src/order-service.spec.ts' && r.reason === 'test')).toBe(true);
  });

  it('finds a caller via a grep-for-imports match', () => {
    const probe = probeRepo(repoRoot);
    const related = findRelatedFiles('src/order-service.ts', probe);
    expect(related.some((r) => r.path === 'src/checkout.ts' && r.reason === 'caller')).toBe(true);
  });

  it('does not report an unrelated file as a caller or test', () => {
    const probe = probeRepo(repoRoot);
    const related = findRelatedFiles('src/order-service.ts', probe);
    expect(related.some((r) => r.path === 'src/unrelated.ts')).toBe(false);
  });

  it('never includes the changed file itself as its own related file', () => {
    const probe = probeRepo(repoRoot);
    const related = findRelatedFiles('src/order-service.ts', probe);
    expect(related.some((r) => r.path === 'src/order-service.ts')).toBe(false);
  });
});
