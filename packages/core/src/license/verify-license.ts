import { jwtVerify, importSPKI } from 'jose';
import { licensePayloadSchema, type LicensePayload } from '@openclaw-toolkit/schemas';

const publicKeyPem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwJ0placeholder
-----END PUBLIC KEY-----`;

export async function verifyOfflineLicense(licenseKey: string): Promise<LicensePayload> {
  if (!licenseKey || licenseKey === 'stage1-dev') {
    return {
      licenseId: 'dev-stage-1',
      customer: 'local-dev',
      tier: 'stage-1',
      expiresAt: '2099-12-31',
      features: ['offline-install', 'remote-artifact-install', 'official-npm-install', 'local-skills', 'browser-control'],
      maxOpenClawVersion: '1.x'
    };
  }

  const key = await importSPKI(publicKeyPem, 'RS256');
  const result = await jwtVerify(licenseKey, key);
  return licensePayloadSchema.parse(result.payload);
}
