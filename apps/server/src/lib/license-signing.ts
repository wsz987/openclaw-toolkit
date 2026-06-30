import { createPrivateKey, sign } from 'node:crypto';

const LICENSE_FILE_VERSION = 1;
const DEFAULT_KEY_ID = 1;

export type OfflineLicensePayload = {
  licenseId: string;
  customer: string;
  tier: string;
  expiresAt: string | null;
  features: string[];
  activationHash: string;
  iat: number;
  exp?: number;
};

export type SignedLicenseFile = {
  version: number;
  keyId: number;
  alg: 'Ed25519';
  payload: string;
  signature: string;
};

function base64Url(input: Buffer | Uint8Array) {
  return Buffer.from(input).toString('base64url');
}

export function buildSignedLicenseFile(payload: OfflineLicensePayload, privateKeyPem: string): SignedLicenseFile {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payloadBytes, privateKey);

  return {
    version: LICENSE_FILE_VERSION,
    keyId: DEFAULT_KEY_ID,
    alg: 'Ed25519',
    payload: base64Url(payloadBytes),
    signature: base64Url(signature)
  };
}
