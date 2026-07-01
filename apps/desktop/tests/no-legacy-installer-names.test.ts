import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const legacyDirectoryName = ['stage', '1'].join('');
const installerDirectoryName = 'installer';
const legacyTypePrefixPattern = new RegExp(`\\b${['Stage', '1'].join('')}[A-Za-z0-9_]*\\b`);

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('desktop frontend installer naming', () => {
  it('does not keep legacy installer file names or identifiers', () => {
    const sourceRoot = join(process.cwd(), 'src/features', installerDirectoryName);
    const testRoot = join(process.cwd(), 'tests');
    const sourceFiles = readSourceFiles(sourceRoot);
    const testFiles = readSourceFiles(testRoot);

    const fileNameOffenders = sourceFiles
      .filter((file) => basename(file).toLowerCase().includes(legacyDirectoryName))
      .map((file) => relative(sourceRoot, file).replaceAll('\\', '/'));

    const identifierOffenders = [...sourceFiles, ...testFiles].flatMap((file) => {
      const root = file.startsWith(sourceRoot) ? sourceRoot : testRoot;
      const rel = relative(root, file).replaceAll('\\', '/');
      const text = readFileSync(file, 'utf8');
      return legacyTypePrefixPattern.test(text) ? [rel] : [];
    });

    expect({ fileNameOffenders, identifierOffenders }).toEqual({
      fileNameOffenders: [],
      identifierOffenders: []
    });
  });
});
