import { describe, expect, it } from 'vitest';
import { selectDesktopUpdate } from './update-selection';
import type { DesktopUpdateCandidate } from './update-selection';

const candidates: DesktopUpdateCandidate[] = [
  {
    version: '0.1.1',
    enabled: true,
    channel: 'stable',
    notes: 'old',
    pubDate: '2026-06-01T00:00:00.000Z',
    asset: {
      target: 'windows',
      arch: 'x86_64',
      enabled: true,
      url: 'https://cdn.example.com/openclaw-0.1.1.nsis.zip',
      signature: 'sig-old'
    }
  },
  {
    version: '0.1.2',
    enabled: false,
    channel: 'stable',
    notes: 'disabled',
    pubDate: '2026-06-10T00:00:00.000Z',
    asset: {
      target: 'windows',
      arch: 'x86_64',
      enabled: true,
      url: 'https://cdn.example.com/openclaw-0.1.2.nsis.zip',
      signature: 'sig-disabled'
    }
  },
  {
    version: '0.1.3',
    enabled: true,
    channel: 'stable',
    notes: 'latest windows',
    pubDate: '2026-06-20T00:00:00.000Z',
    asset: {
      target: 'windows',
      arch: 'x86_64',
      enabled: true,
      url: 'https://cdn.example.com/openclaw-0.1.3.nsis.zip',
      signature: 'sig-latest'
    }
  },
  {
    version: '0.1.4',
    enabled: true,
    channel: 'stable',
    notes: 'wrong platform',
    pubDate: '2026-06-21T00:00:00.000Z',
    asset: {
      target: 'darwin',
      arch: 'aarch64',
      enabled: true,
      url: 'https://cdn.example.com/openclaw-0.1.4.app.tar.gz',
      signature: 'sig-mac'
    }
  }
];

describe('selectDesktopUpdate', () => {
  it('returns the newest enabled compatible update newer than the current version', () => {
    expect(selectDesktopUpdate(candidates, {
      currentVersion: '0.1.0',
      target: 'windows',
      arch: 'x86_64',
      channel: 'stable'
    })).toEqual({
      version: '0.1.3',
      notes: 'latest windows',
      pub_date: '2026-06-20T00:00:00.000Z',
      url: 'https://cdn.example.com/openclaw-0.1.3.nsis.zip',
      signature: 'sig-latest'
    });
  });

  it('returns null when the current version is already up to date', () => {
    expect(selectDesktopUpdate(candidates, {
      currentVersion: '0.1.3',
      target: 'windows',
      arch: 'x86_64',
      channel: 'stable'
    })).toBeNull();
  });

  it('ignores disabled assets', () => {
    expect(selectDesktopUpdate([
      {
        version: '0.2.0',
        enabled: true,
        channel: 'stable',
        notes: 'disabled asset',
        pubDate: '2026-06-22T00:00:00.000Z',
        asset: {
          target: 'windows',
          arch: 'x86_64',
          enabled: false,
          url: 'https://cdn.example.com/openclaw-0.2.0.nsis.zip',
          signature: 'sig'
        }
      }
    ], {
      currentVersion: '0.1.0',
      target: 'windows',
      arch: 'x86_64',
      channel: 'stable'
    })).toBeNull();
  });
});
