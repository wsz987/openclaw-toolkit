import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const legacyFeatureDirectory = ['features', ['stage', '1'].join('')].join('/');
const legacyFeatureDirectoryWindows = legacyFeatureDirectory.replace('/', '\\');
const legacyDebugStorageKey = [['stage', '1'].join(''), 'debug-flow'].join('-');

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('desktop installer feature directory', () => {
  it('does not reference legacy feature directory paths or debug keys', () => {
    const workspaceRoot = process.cwd();
    const files = [
      ...readSourceFiles(join(workspaceRoot, 'src')),
      ...readSourceFiles(join(workspaceRoot, 'tests'))
    ];

    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const rel = relative(workspaceRoot, file).replaceAll('\\', '/');
      const reasons = [];

      if (text.includes(legacyFeatureDirectory) || text.includes(legacyFeatureDirectoryWindows)) {
        reasons.push('legacy feature path');
      }

      if (text.includes(legacyDebugStorageKey)) {
        reasons.push('legacy debug storage key');
      }

      return reasons.map((reason) => `${rel}: ${reason}`);
    });

    expect(offenders).toEqual([]);
  });
});
