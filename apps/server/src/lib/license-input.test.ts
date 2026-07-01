import { describe, expect, it } from 'vitest';
import { createLicenseKeySchema, DEFAULT_LICENSE_FEATURES } from './license-input';

describe('license-input', () => {
  it('defaults new license keys to the basic tier with no extra features', () => {
    const input = createLicenseKeySchema.parse({
      companyName: 'Example Co'
    });

    expect(input.tier).toBe('basic');
    expect(input.features).toEqual([]);
    expect(DEFAULT_LICENSE_FEATURES).toEqual([]);
  });

  it('does not accept offline license signing options on the server input path', () => {
    const input = createLicenseKeySchema.parse({
      companyName: 'Example Co',
      issueOfflineLicense: true,
      offlineSigningPrivateKeyPem: 'private-key'
    });

    expect(input).not.toHaveProperty('issueOfflineLicense');
    expect(input).not.toHaveProperty('offlineSigningPrivateKeyPem');
  });
});
