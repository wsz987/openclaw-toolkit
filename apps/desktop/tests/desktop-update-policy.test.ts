import { describe, expect, it } from 'vitest';
import { buildUpdateCheckFailure } from '../src/features/installer/hooks/desktop-update-policy';

describe('buildUpdateCheckFailure', () => {
  it('logs manual check failures while showing no available update to users', () => {
    expect(buildUpdateCheckFailure(new Error('request failed'), true)).toEqual({
      status: 'not-available',
      userError: null,
      logMessage: '[更新检查] request failed'
    });
  });

  it('logs automatic check failures without surfacing a frontend error', () => {
    expect(buildUpdateCheckFailure('missing version', false)).toEqual({
      status: 'idle',
      userError: null,
      logMessage: '[更新检查] missing version'
    });
  });
});
