#!/usr/bin/env node
import {
  createHash,
  generateKeyPairSync,
  randomInt,
  randomUUID,
  sign
} from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { add, format, isValid, parseISO } from 'date-fns';
import { parse as parseDuration } from 'tinyduration';

const DEFAULT_KEY_DIR = 'license-keys';
const DEFAULT_PRIVATE_KEY = path.join(DEFAULT_KEY_DIR, 'openclaw-license-private.pem');
const DEFAULT_PUBLIC_KEY_DER = path.join(DEFAULT_KEY_DIR, 'openclaw-license-public.der');
const DEFAULT_CLIENT_PUBLIC_KEY = path.join(
  'apps',
  'desktop',
  'src-tauri',
  'keys',
  'openclaw-license-public.der'
);
const DEFAULT_INSTALLED_LICENSE_FILE = path.join('licenses', 'license.dat');
const LICENSE_FILE_NAME = 'license.dat';
const ACTIVATION_CODE_FILE_NAME = 'activation-code.txt';
const LICENSE_FILE_VERSION = 1;
const DEFAULT_KEY_ID = 1;
const DEFAULT_CODE_LENGTH = 12;
const CODE_GROUP_SIZE = 4;
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const DEFAULT_TIER = 'basic';
const DEFAULT_FEATURES = [];
const VALID_TIERS = new Set(['basic', 'pro', 'enterprise']);

const DEFAULT_CUSTOMER = 'OpenClaw Customer';
const COMPACT_DURATION_PATTERN = /^(\d+)([dwmy])$/i;
const COMPACT_DURATION_UNITS = {
  d: 'D',
  w: 'W',
  m: 'M',
  y: 'Y'
};
const DATE_DURATION_KEYS = ['years', 'months', 'weeks', 'days'];
const TIME_DURATION_KEYS = ['hours', 'minutes', 'seconds'];
const EXPIRY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function usage() {
  console.log(`OpenClaw offline license tool

Usage:
  node scripts/license.mjs generate-keys [--out-dir license-keys] [--install-public-key]
  node scripts/license.mjs issue [--tier <basic|pro|enterprise>] (--expires-in <duration> | --expires-at <YYYY-MM-DD>) [options]

Commands:
  generate-keys              Create internal Ed25519 signing private key and client DER public key.
  issue                      Issue a short customer activation code and a signed license.dat file.

Issue options:
  --private-key <path>        Signing private key PEM. Default: ${DEFAULT_PRIVATE_KEY}
  --license-id <id>          Stable license id. Default: generated UUID
  --customer <name>          Customer label. Default: ${DEFAULT_CUSTOMER}
  --expires-in <duration>    Validity from today. Examples: 30d, 2w, 1m, 1y, P1M, P1Y.
  --expires-at <YYYY-MM-DD>  Absolute expiry date. Mutually exclusive with --expires-in.
  --features <a,b,c>         Comma-separated feature list.
  --feature <name>           Add one feature. Can be repeated.
  --activation-code <code>   Reuse a specific short activation code.
  --code-length <number>     Number of base32 characters before grouping. Default: ${DEFAULT_CODE_LENGTH}.
  --out-dir <path>           Write activation-code.txt and license.dat to this directory.
  --output <path>            Also write the short activation code to this file.
  --license-file <path>      Also write license.dat to this path.
  --install-license-file     Copy license.dat to ${DEFAULT_INSTALLED_LICENSE_FILE}.
`);
}

function parseArgs(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    return { command: 'help', options: { help: true, _: [] } };
  }

  const [command, ...tokens] = argv;
  const options = { _: [] };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      continue;
    }

    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }

    const eqIndex = token.indexOf('=');
    const key = token.slice(2, eqIndex === -1 ? undefined : eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : token.slice(eqIndex + 1);

    if (key === 'help' || key === 'install-public-key' || key === 'install-license-file') {
      options[key] = true;
      continue;
    }

    const value = inlineValue ?? tokens[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    if (inlineValue === undefined) {
      index += 1;
    }

    if (key === 'feature') {
      options.feature = [...(options.feature ?? []), value];
    } else {
      options[key] = value;
    }
  }

  return { command, options };
}

function assertRequired(options, keys) {
  for (const key of keys) {
    if (!options[key]) {
      throw new Error(`Missing required option --${key}`);
    }
  }
}

function normalizeFeatures(options) {
  const features = new Set(DEFAULT_FEATURES);

  if (typeof options.features === 'string') {
    for (const feature of options.features.split(',')) {
      const normalized = feature.trim();
      if (normalized) {
        features.add(normalized);
      }
    }
  }

  for (const feature of options.feature ?? []) {
    const normalized = feature.trim();
    if (normalized) {
      features.add(normalized);
    }
  }

  return [...features].sort();
}

function parseExpiryDate(expiresAt) {
  if (!EXPIRY_DATE_PATTERN.test(expiresAt)) {
    throw new Error('--expires-at must use YYYY-MM-DD');
  }

  const expires = parseISO(`${expiresAt}T23:59:59.000Z`);
  if (!isValid(expires)) {
    throw new Error(`Invalid --expires-at: ${expiresAt}`);
  }

  return expires;
}

function expiryToUnix(expiresAt) {
  const expires = parseExpiryDate(expiresAt);
  return Math.floor(expires.getTime() / 1000);
}

function normalizeCompactDuration(value) {
  const compact = value.match(COMPACT_DURATION_PATTERN);
  if (!compact) {
    return value.toUpperCase();
  }

  const [, amount, unit] = compact;
  return `P${amount}${COMPACT_DURATION_UNITS[unit.toLowerCase()]}`;
}

function parseValidityDuration(value) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    throw new Error('Missing value for --expires-in');
  }

  let duration;
  try {
    duration = parseDuration(normalizeCompactDuration(normalizedValue));
  } catch {
    throw new Error('--expires-in must be a duration like 30d, 2w, 1m, 1y, or ISO-8601 P1M');
  }

  if (duration.negative) {
    throw new Error('--expires-in must be a positive duration');
  }

  for (const key of TIME_DURATION_KEYS) {
    if (duration[key]) {
      throw new Error('--expires-in only supports day/week/month/year durations');
    }
  }

  const calendarDuration = {};
  let hasDuration = false;
  for (const key of DATE_DURATION_KEYS) {
    const amount = duration[key] ?? 0;
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('--expires-in must use positive whole numbers');
    }
    if (amount > 0) {
      calendarDuration[key] = amount;
      hasDuration = true;
    }
  }

  if (!hasDuration) {
    throw new Error('--expires-in must be greater than zero');
  }

  return calendarDuration;
}

function resolveExpiresAt(options) {
  const expiresAt = options['expires-at'];
  const expiresIn = options['expires-in'];

  if (expiresAt && expiresIn) {
    throw new Error('Use only one of --expires-at or --expires-in');
  }
  if (!expiresAt && !expiresIn) {
    throw new Error('Missing required option --expires-at or --expires-in');
  }
  if (expiresAt) {
    const normalizedExpiresAt = String(expiresAt).trim();
    parseExpiryDate(normalizedExpiresAt);
    return normalizedExpiresAt;
  }

  const expiresOn = add(new Date(), parseValidityDuration(expiresIn));
  if (!isValid(expiresOn)) {
    throw new Error(`Invalid --expires-in: ${expiresIn}`);
  }
  return format(expiresOn, 'yyyy-MM-dd');
}

function normalizeLicenseUuid(licenseId) {
  const value = String(licenseId).trim();
  const uuid = value.startsWith('lic-') ? value.slice(4) : value;
  const match = uuid.match(
    /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i
  );
  if (!match) {
    throw new Error('--license-id must be a UUID or lic-<UUID>');
  }

  return `lic-${uuid.toLowerCase()}`;
}

function parseCodeLength(value) {
  if (value === undefined) {
    return DEFAULT_CODE_LENGTH;
  }

  const length = Number(value);
  if (!Number.isInteger(length) || length < 8 || length > 32) {
    throw new Error('--code-length must be a whole number from 8 to 32');
  }
  return length;
}

function normalizeActivationCode(value) {
  const chars = [];
  for (const char of String(value ?? '').trim()) {
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
      throw new Error('Activation code must use Crockford Base32 characters');
    }
    chars.push(normalized);
  }

  if (chars.length === 0) {
    throw new Error('Activation code must not be empty');
  }

  return chars.join('');
}

function formatActivationCode(value) {
  const normalized = normalizeActivationCode(value);
  const groups = [];
  for (let index = 0; index < normalized.length; index += CODE_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + CODE_GROUP_SIZE));
  }
  return groups.join('-');
}

function generateActivationCode(length = DEFAULT_CODE_LENGTH) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return formatActivationCode(code);
}

function activationCodeHash(activationCode) {
  const normalizedCode = normalizeActivationCode(activationCode);
  return `sha256:${createHash('sha256').update(normalizedCode, 'utf8').digest('hex')}`;
}

function defaultBundleDir(licenseId) {
  return path.join(DEFAULT_KEY_DIR, 'issued', licenseId);
}

function buildSignedLicenseFile(payload, privateKeyPem) {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = sign(null, payloadBytes, privateKeyPem);

  return {
    version: LICENSE_FILE_VERSION,
    keyId: DEFAULT_KEY_ID,
    alg: 'Ed25519',
    payload: payloadBytes.toString('base64url'),
    signature: signature.toString('base64url')
  };
}

function writeJsonFile(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function generateKeys(options) {
  const outDir = options['out-dir'] ?? DEFAULT_KEY_DIR;
  mkdirSync(outDir, { recursive: true });

  const privateKeyPath = path.join(outDir, 'openclaw-license-private.pem');
  const publicKeyDerPath = path.join(outDir, 'openclaw-license-public.der');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  });
  const publicKeyDer = publicKey.export({
    type: 'spki',
    format: 'der'
  });

  writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
  writeFileSync(publicKeyDerPath, publicKeyDer, { mode: 0o644 });

  console.log(`Ed25519 signing private key PEM: ${privateKeyPath}`);
  console.log(`Ed25519 signing public key DER: ${publicKeyDerPath}`);

  if (options['install-public-key']) {
    mkdirSync(path.dirname(DEFAULT_CLIENT_PUBLIC_KEY), { recursive: true });
    writeFileSync(DEFAULT_CLIENT_PUBLIC_KEY, publicKeyDer, { mode: 0o644 });
    console.log(`Client verification public key updated: ${DEFAULT_CLIENT_PUBLIC_KEY}`);
  }
}

function issueLicense(options) {
  options.tier = String(options.tier ?? DEFAULT_TIER).trim();

  if (!VALID_TIERS.has(options.tier)) {
    throw new Error('--tier must be basic, pro, or enterprise');
  }

  const customer = String(options.customer ?? DEFAULT_CUSTOMER).trim();
  if (!customer) {
    throw new Error('--customer must not be empty');
  }

  const expiresAt = resolveExpiresAt(options);
  const privateKeyPath = options['private-key'] ?? DEFAULT_PRIVATE_KEY;
  const privateKey = readFileSync(privateKeyPath, 'utf8');
  const licenseId = normalizeLicenseUuid(options['license-id'] ?? `lic-${randomUUID()}`);
  const activationCode = options['activation-code']
    ? formatActivationCode(options['activation-code'])
    : generateActivationCode(parseCodeLength(options['code-length']));
  const exp = expiryToUnix(expiresAt);
  const payload = {
    licenseId,
    customer,
    tier: options.tier,
    expiresAt,
    features: normalizeFeatures(options),
    activationHash: activationCodeHash(activationCode),
    iat: Math.floor(Date.now() / 1000),
    exp
  };
  const licenseFile = buildSignedLicenseFile(payload, privateKey);
  const outDir = options['out-dir'] ?? defaultBundleDir(licenseId);
  const activationCodePath = path.join(outDir, ACTIVATION_CODE_FILE_NAME);
  const licenseFilePath = path.join(outDir, LICENSE_FILE_NAME);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(activationCodePath, `${activationCode}\n`);
  writeJsonFile(licenseFilePath, licenseFile);

  if (options.output) {
    mkdirSync(path.dirname(options.output), { recursive: true });
    writeFileSync(options.output, `${activationCode}\n`);
    console.log(`Activation code file: ${options.output}`);
  }

  if (options['license-file']) {
    mkdirSync(path.dirname(options['license-file']), { recursive: true });
    copyFileSync(licenseFilePath, options['license-file']);
    console.log(`License file: ${options['license-file']}`);
  }

  if (options['install-license-file']) {
    mkdirSync(path.dirname(DEFAULT_INSTALLED_LICENSE_FILE), { recursive: true });
    copyFileSync(licenseFilePath, DEFAULT_INSTALLED_LICENSE_FILE);
    console.log(`Client license file updated: ${DEFAULT_INSTALLED_LICENSE_FILE}`);
  }

  console.log(`Activation code: ${activationCode}`);
  console.log(`License bundle: ${outDir}`);
  console.log(activationCode);
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || options.help) {
    usage();
  } else if (command === 'generate-keys') {
    generateKeys(options);
  } else if (command === 'issue') {
    issueLicense(options);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
