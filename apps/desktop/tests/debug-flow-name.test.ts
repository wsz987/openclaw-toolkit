import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readInstallerDebugFlowState,
  writeInstallerDebugFlowState,
  type InstallerDebugFlowState
} from '../src/features/installer/model/debug-flow';

function createLocalStorageMock() {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe('installer debug flow names', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createLocalStorageMock()
    });
  });

  it('exports neutral debug flow APIs', () => {
    const state: InstallerDebugFlowState = { mode: 'installer', installerStep: 2 };

    writeInstallerDebugFlowState(state);

    expect(readInstallerDebugFlowState()).toEqual(state);
  });
});
