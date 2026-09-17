import { describe, expect, it } from 'vitest';
import { classifyFile, detectLanguage } from '../../src/core/repo/repository-analyzer.js';

describe('detectLanguage', () => {
  it.each([
    ['src/foo.ts', 'typescript'],
    ['src/foo.tsx', 'typescript'],
    ['src/foo.js', 'javascript'],
    ['README.md', 'markdown'],
    ['.anubis.yml', 'yaml'],
    ['Makefile', 'unknown'],
  ])('classifies %s as %s', (path, expected) => {
    expect(detectLanguage(path)).toBe(expected);
  });
});

describe('classifyFile', () => {
  it.each([
    ['src/order-service.ts', 'source'],
    ['src/order-service.spec.ts', 'test'],
    ['step-definitions/order.steps.ts', 'test'],
    ['features/order.feature.ts', 'test'],
    ['package.json', 'config'],
    ['wdio.conf.ts', 'config'],
    ['tsconfig.json', 'config'],
    ['README.md', 'docs'],
    ['docs/architecture.md', 'docs'],
    ['dist/index.js', 'generated'],
    ['src/types.d.ts', 'generated'],
  ])('classifies %s as %s', (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });

  it('classifies generated before test/config when patterns could overlap', () => {
    expect(classifyFile('dist/foo.test.js')).toBe('generated');
  });
});
