import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const deprecatedTypes = ['Stage1Dashboard', 'Stage1Phase', 'Stage1InstallLogTail'] as const;

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('workflow view type names', () => {
  it('keeps deprecated workflow view type names only as compatibility aliases', () => {
    const root = join(process.cwd(), 'src/features/stage1');
    const offenders = readSourceFiles(root).flatMap((file) => {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (rel === 'model/types.ts') {
        return [];
      }

      const text = readFileSync(file, 'utf8');
      return deprecatedTypes
        .filter((typeName) => new RegExp(`\\b${typeName}\\b`).test(text))
        .map((typeName) => `${rel}: ${typeName}`);
    });

    expect(offenders).toEqual([]);
  });
});
