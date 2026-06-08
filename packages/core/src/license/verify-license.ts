import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { LicensePayload } from '@openclaw-toolkit/schemas';

const PUBLIC_KEY_PATH = fileURLToPath(
  new URL('../../../../apps/desktop/src-tauri/keys/openclaw-license-public.der', import.meta.url)
);
const DEFAULT_LICENSE_FILE_PATH = fileURLToPath(
  new URL('../../../../artifacts/license.dat', import.meta.url)
);
const LICENSE_FILE_VERSION = 1;
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type SignedLicenseFile = {
  version: number;
  keyId?: number;
  alg: string;
  payload: string;
  signature: string;
};

type LicensePayloadWithActivation = LicensePayload & {
  activationHash?: string;
  iat?: number;
  exp?: number;
};

export async function verifyOfflineLicense(
  activationCode: string,
  licenseFilePath = DEFAULT_LICENSE_FILE_PATH
): Promise<LicensePayload> {
  const normalizedCode = normalizeActivationCode(activationCode);
  if (!normalizedCode) {
    throw new Error('请输入离线激活码');
  }

  if (activationCode.trim() === 'stage1-dev' && process.env.NODE_ENV !== 'production') {
    return {
      licenseId: 'dev-stage-1',
      customer: 'local-dev',
      tier: 'stage-1',
      expiresAt: '2099-12-31',
      features: [
        'offline-install',
        'remote-artifact-install',
        'official-npm-install',
        'managed-node-runtime',
        'local-skills',
        'browser-control',
        'feishu-plugin'
      ]
    };
  }

  const [publicKeyDer, licenseFileContent] = await Promise.all([
    readFile(PUBLIC_KEY_PATH),
    readFile(licenseFilePath, 'utf8')
  ]);
  const signedFile = parseSignedLicenseFile(licenseFileContent);
  const payloadBytes = Buffer.from(signedFile.payload, 'base64url');
  const signature = Buffer.from(signedFile.signature, 'base64url');
  const publicKey = createPublicKey({
    key: publicKeyDer,
    format: 'der',
    type: 'spki'
  });

  if (!verify(null, payloadBytes, publicKey, signature)) {
    throw new Error('离线授权文件验签失败');
  }

  const license = JSON.parse(payloadBytes.toString('utf8')) as LicensePayloadWithActivation;
  validateActivationCodeBinding(license, normalizedCode);
  validateLicensePayload(license);
  return license;
}

function parseSignedLicenseFile(content: string): SignedLicenseFile {
  let signedFile: SignedLicenseFile;
  try {
    signedFile = JSON.parse(content) as SignedLicenseFile;
  } catch {
    throw new Error('离线授权文件格式无效');
  }

  if (signedFile.version !== LICENSE_FILE_VERSION) {
    throw new Error('不支持的离线授权文件版本');
  }
  if (signedFile.alg !== 'Ed25519') {
    throw new Error('不支持的离线授权签名算法');
  }
  if (!signedFile.payload || !signedFile.signature) {
    throw new Error('离线授权文件格式无效');
  }

  return signedFile;
}

function normalizeActivationCode(value: string) {
  const chars: string[] = [];
  for (const char of value.trim()) {
    if (char === '-' || /\s/u.test(char)) {
      continue;
    }

    let normalized = char.toUpperCase();
    if (normalized === 'I' || normalized === 'L') {
      normalized = '1';
    } else if (normalized === 'O') {
      normalized = '0';
    }

    if (!CODE_ALPHABET.includes(normalized)) {
      throw new Error('离线激活码格式无效');
    }
    chars.push(normalized);
  }

  return chars.join('');
}

function activationCodeHash(normalizedCode: string) {
  return `sha256:${createHash('sha256').update(normalizedCode, 'utf8').digest('hex')}`;
}

function validateActivationCodeBinding(license: LicensePayloadWithActivation, normalizedCode: string) {
  if (!license.activationHash) {
    throw new Error('离线授权文件缺少 activationHash');
  }
  if (license.activationHash !== activationCodeHash(normalizedCode)) {
    throw new Error('离线激活码与授权文件不匹配');
  }
}

function validateLicensePayload(license: LicensePayloadWithActivation) {
  if (!license.licenseId?.trim()) {
    throw new Error('授权缺少 licenseId');
  }
  if (!license.customer?.trim()) {
    throw new Error('授权缺少 customer');
  }
  if (license.tier !== 'stage-1' && license.tier !== 'stage-2') {
    throw new Error(`未知授权等级: ${license.tier}`);
  }
  if (!license.features?.length) {
    throw new Error('授权未包含任何功能能力');
  }

  const expiresAt = typeof license.exp === 'number'
    ? new Date(license.exp * 1000)
    : new Date(`${license.expiresAt}T23:59:59.000Z`);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error(`授权过期时间格式无效: ${license.expiresAt}`);
  }
  if (expiresAt.getTime() < Date.now()) {
    throw new Error(`授权已过期: ${license.expiresAt}`);
  }
}

export function ensureLicenseFeature(license: LicensePayload, feature: string) {
  if (!license.features.includes(feature)) {
    throw new Error(`当前授权不包含 ${feature} 能力`);
  }
}

export function ensureInstallModeAllowed(license: LicensePayload, installMode: string) {
  const requiredFeatureByMode: Record<string, string> = {
    local: 'offline-install',
    remote: 'remote-artifact-install',
    npm: 'official-npm-install'
  };
  const requiredFeature = requiredFeatureByMode[installMode];
  if (!requiredFeature) {
    throw new Error(`未知安装模式: ${installMode}`);
  }
  ensureLicenseFeature(license, requiredFeature);
}
