import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('install result type names', () => {
  it('keeps Stage1InstallResult only as a compatibility alias', () => {
    const root = join(process.cwd(), 'src/features/stage1');
    const files = readSourceFiles(root);
    const offenders = files
      .map((file) => ({
        file,
        text: readFileSync(file, 'utf8')
      }))
      .filter(({ file, text }) => {
        const rel = relative(root, file).replaceAll('\\', '/');
        if (rel === 'model/types.ts') {
          return !text.includes('export type Stage1InstallResult = OpenClawInstallResult;');
        }
        return text.includes('Stage1InstallResult');
      })
      .map(({ file }) => relative(root, file).replaceAll('\\', '/'));

    expect(offenders).toEqual([]);
  });
});
