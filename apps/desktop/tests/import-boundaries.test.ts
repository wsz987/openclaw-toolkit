import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return collectSourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function readImports(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  return Array.from(
    source.matchAll(/import(?:\s+type)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g),
    (match) => match[1]
  );
}

function toProjectPath(path: string) {
  return relative(process.cwd(), path).split(sep).join('/');
}

describe('desktop import boundaries', () => {
  const imports = collectSourceFiles(sourceRoot).flatMap((file) =>
    readImports(file).map((specifier) => ({
      file: toProjectPath(file),
      resolved: specifier.startsWith('.')
        ? toProjectPath(normalize(join(dirname(file), specifier)))
        : specifier,
      specifier
    }))
  );

  it('uses source-root aliases for shared app modules instead of deep relative paths', () => {
    const violations = imports.filter(
      ({ resolved, specifier }) =>
        specifier.startsWith('../') &&
        /^(src\/components|src\/hooks|src\/lib|src\/openclaw)\//.test(resolved)
    );

    expect(violations).toEqual([]);
  });

  it('does not let dashboard import shared OpenClaw modules through the installer feature', () => {
    const violations = imports.filter(
      ({ file, resolved, specifier }) =>
        file.startsWith('src/features/dashboard/') &&
        (specifier.includes('installer/api/') ||
          specifier.includes('installer/model/') ||
          specifier.includes('installer/hooks/') ||
          resolved.startsWith('src/features/installer/api/') ||
          resolved.startsWith('src/features/installer/model/') ||
          resolved.startsWith('src/features/installer/hooks/'))
    );

    expect(violations).toEqual([]);
  });
});
