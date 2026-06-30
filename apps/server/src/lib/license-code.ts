import { createHash, randomInt } from 'node:crypto';

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateActivationCode() {
  const chars: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    chars.push(CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export function normalizeActivationCode(value: string) {
  let normalizedCode = '';
  for (const char of value.trim()) {
    if (char === '-' || /\s/.test(char)) {
      continue;
    }

    let normalized = char.toUpperCase();
    if (normalized === 'I' || normalized === 'L') {
      normalized = '1';
    } else if (normalized === 'O') {
      normalized = '0';
    }

    if (!CODE_ALPHABET.includes(normalized)) {
      throw new Error('激活码格式无效');
    }
    normalizedCode += normalized;
  }

  if (normalizedCode.length !== 12) {
    throw new Error('激活码格式无效');
  }

  return normalizedCode;
}

export function activationCodeHash(activationCode: string) {
  const normalizedCode = normalizeActivationCode(activationCode);
  return `sha256:${createHash('sha256').update(normalizedCode).digest('hex')}`;
}

export function activationCodePreview(activationCode: string) {
  const normalizedCode = normalizeActivationCode(activationCode);
  return `${normalizedCode.slice(0, 4)}-****-${normalizedCode.slice(8, 12)}`;
}
