import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tauriRoot = join(process.cwd(), 'src-tauri', 'src');

describe('desktop-owned runtime architecture', () => {
  it('does not ship a persistent runtime host daemon', () => {
    expect(existsSync(join(tauriRoot, 'bin', 'openclaw-host.rs'))).toBe(false);
    expect(existsSync(join(tauriRoot, 'core', 'runtime_host.rs'))).toBe(false);
  });

  it('does not reference legacy file IPC or external helper mode from active entry points', () => {
    const source = [
      join(tauriRoot, 'lib.rs'),
      join(tauriRoot, 'commands', 'post_install.rs')
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(source).not.toMatch(/external-helper|spawn-daemon|command\.json|result\.json/);
  });
});
