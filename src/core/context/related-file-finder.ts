import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { RepoProbe } from '../repo/manifest-reader.js';
import type { RelatedFile } from '../types/context.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const MAX_FILES_SCANNED_FOR_CALLERS = 300;
const MAX_RESULTS_PER_REASON = 5;

function moduleNameOf(path: string): string {
  const base = basename(path);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/** Naming-convention lookup, not an AST call graph: `foo.ts` -> `foo.spec.ts` / `foo.test.ts` / `__tests__/foo.ts`. */
function findTestFiles(changedPath: string, repoFiles: string[]): string[] {
  const moduleName = moduleNameOf(changedPath);
  const dir = dirname(changedPath);
  const exact = new Set([
    join(dir, `${moduleName}.spec.ts`),
    join(dir, `${moduleName}.spec.js`),
    join(dir, `${moduleName}.test.ts`),
    join(dir, `${moduleName}.test.js`),
    join(dir, '__tests__', `${moduleName}.ts`),
    join(dir, '__tests__', `${moduleName}.js`),
  ]);
  return repoFiles.filter(
    (f) => f !== changedPath && (exact.has(f) || f.includes(`${moduleName}.test.`) || f.includes(`${moduleName}.spec.`)),
  );
}

/** Grep-for-imports, not an AST call graph: cheap and bounded, not exhaustive. */
function findCallers(changedPath: string, probe: RepoProbe): { path: string; excerpt: string }[] {
  const moduleName = moduleNameOf(changedPath);
  const candidates = probe.repoFiles
    .filter((f) => f !== changedPath && SOURCE_EXTENSIONS.has(extname(f)))
    .slice(0, MAX_FILES_SCANNED_FOR_CALLERS);

  const callers: { path: string; excerpt: string }[] = [];
  for (const candidate of candidates) {
    if (callers.length >= MAX_RESULTS_PER_REASON) break;
    let content: string;
    try {
      content = readFileSync(join(probe.repoRoot, candidate), 'utf-8');
    } catch {
      continue;
    }
    const importLine = content.split('\n').find((line) => (line.includes('import') || line.includes('require(')) && line.includes(moduleName));
    if (importLine) {
      callers.push({ path: candidate, excerpt: importLine.trim() });
    }
  }
  return callers;
}

export function findRelatedFiles(changedPath: string, probe: RepoProbe): RelatedFile[] {
  const related: RelatedFile[] = [];

  for (const testPath of findTestFiles(changedPath, probe.repoFiles).slice(0, MAX_RESULTS_PER_REASON)) {
    related.push({ path: testPath, reason: 'test', excerpt: `test file for ${changedPath} (naming-convention match)` });
  }

  for (const caller of findCallers(changedPath, probe)) {
    related.push({ path: caller.path, reason: 'caller', excerpt: caller.excerpt });
  }

  return related;
}
