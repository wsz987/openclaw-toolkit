import { describe, expect, it } from 'vitest';
import { activationCodeHash, activationCodePreview, normalizeActivationCode } from './license-code';

describe('license-code', () => {
  it('normalizes separators and common confusable characters', () => {
    expect(normalizeActivationCode('oflk-29hd-q7m2')).toBe('0F1K29HDQ7M2');
  });

  it('rejects invalid code length', () => {
    expect(() => normalizeActivationCode('ABCD-1234')).toThrow('激活码格式无效');
  });

  it('builds stable hashes and safe previews', () => {
    expect(activationCodeHash('8F3K-29HD-Q7M2')).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(activationCodePreview('8F3K-29HD-Q7M2')).toBe('8F3K-****-Q7M2');
  });
});
