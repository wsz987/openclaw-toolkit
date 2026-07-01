import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '@/db/client';
import { companies, licenseActivationEvents, licenseKeys } from '@/db/schema';
import { activationCodeHash, activationCodePreview, generateActivationCode } from './license-code';
import type { CreateCompanyInput, CreateLicenseKeyInput, ValidateLicenseKeyInput } from './license-input';

export type LicenseValidationResult = {
  valid: boolean;
  code: string;
  message: string;
  license: {
    licenseId: string;
    companyName: string;
    tier: string;
    features: string[];
    expiresAt: string | null;
    status: string;
    maxActivations: number | null;
    activationCount: number;
  } | null;
};

function nullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function parseFeatures(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function machineIdHash(machineId: string | null | undefined) {
  const value = nullable(machineId);
  if (!value) {
    return null;
  }
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function getOrCreateCompanyByName(name: string) {
  const normalizedName = name.trim();
  const existing = getDb()
    .select()
    .from(companies)
    .where(eq(companies.name, normalizedName))
    .get();
  if (existing) {
    return existing;
  }

  const [created] = getDb()
    .insert(companies)
    .values({ id: randomUUID(), name: normalizedName })
    .returning()
    .all();
  return created;
}

export async function createCompany(input: CreateCompanyInput) {
  const [company] = getDb()
    .insert(companies)
    .values({
      id: randomUUID(),
      name: input.name.trim(),
      contactName: nullable(input.contactName),
      contactEmail: nullable(input.contactEmail),
      notes: nullable(input.notes)
    })
    .returning()
    .all();
  return company;
}

export async function listCompaniesWithLicenseCounts() {
  const companyRows = getDb()
    .select()
    .from(companies)
    .orderBy(desc(companies.createdAt))
    .all();

  return companyRows.map((company) => {
    const keyRows = getDb()
      .select({ status: licenseKeys.status })
      .from(licenseKeys)
      .where(eq(licenseKeys.companyId, company.id))
      .all();
    return {
      ...company,
      licenseCount: keyRows.length,
      activeLicenseCount: keyRows.filter((row) => row.status === 'active').length
    };
  });
}

export async function issueLicenseKey(input: CreateLicenseKeyInput) {
  const company = input.companyId
    ? getDb().select().from(companies).where(eq(companies.id, input.companyId)).get()
    : await getOrCreateCompanyByName(input.companyName ?? '');
  if (!company) {
    throw new Error('公司不存在');
  }

  const activationCode = input.activationCode?.trim() || generateActivationCode();
  const hash = activationCodeHash(activationCode);
  const licenseId = `lic-${randomUUID()}`;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const [row] = getDb()
    .insert(licenseKeys)
    .values({
      id: randomUUID(),
      companyId: company.id,
      activationCodeHash: hash,
      activationCodePreview: activationCodePreview(activationCode),
      licenseId,
      tier: input.tier,
      featuresJson: JSON.stringify(input.features),
      expiresAt,
      status: 'active',
      maxActivations: input.maxActivations ?? null,
      note: nullable(input.note),
      issuedBy: nullable(input.issuedBy)
    })
    .returning()
    .all();

  return {
    licenseKey: row,
    company,
    activationCode
  };
}

export async function listLicenseKeys() {
  const rows = getDb()
    .select({
      id: licenseKeys.id,
      companyId: licenseKeys.companyId,
      companyName: companies.name,
      activationCodePreview: licenseKeys.activationCodePreview,
      licenseId: licenseKeys.licenseId,
      tier: licenseKeys.tier,
      featuresJson: licenseKeys.featuresJson,
      expiresAt: licenseKeys.expiresAt,
      status: licenseKeys.status,
      maxActivations: licenseKeys.maxActivations,
      activationCount: licenseKeys.activationCount,
      note: licenseKeys.note,
      issuedBy: licenseKeys.issuedBy,
      issuedAt: licenseKeys.issuedAt,
      lastValidatedAt: licenseKeys.lastValidatedAt
    })
    .from(licenseKeys)
    .innerJoin(companies, eq(companies.id, licenseKeys.companyId))
    .orderBy(desc(licenseKeys.issuedAt))
    .all();

  return rows.map((row) => ({
    ...row,
    features: parseFeatures(row.featuresJson),
    expiresAt: toIso(row.expiresAt),
    issuedAt: row.issuedAt.toISOString(),
    lastValidatedAt: toIso(row.lastValidatedAt)
  }));
}

export async function setLicenseKeyStatus(id: string, status: 'active' | 'disabled' | 'revoked') {
  getDb()
    .update(licenseKeys)
    .set({ status, updatedAt: new Date() })
    .where(eq(licenseKeys.id, id))
    .run();
}

async function recordActivationEvent(input: {
  licenseKeyId: string;
  machineIdHash?: string | null;
  machineId?: string | null;
  appVersion?: string | null;
  result: string;
  message: string;
}) {
  getDb().insert(licenseActivationEvents).values({
    id: randomUUID(),
    licenseKeyId: input.licenseKeyId,
    machineIdHash: input.machineIdHash ?? machineIdHash(input.machineId),
    appVersion: nullable(input.appVersion),
    result: input.result,
    message: input.message
  }).run();
}

export async function validateLicenseKey(input: ValidateLicenseKeyInput): Promise<LicenseValidationResult> {
  let hash: string;
  try {
    hash = activationCodeHash(input.activationCode);
  } catch {
    return {
      valid: false,
      code: 'INVALID_FORMAT',
      message: '激活码格式无效',
      license: null
    };
  }

  const row = getDb()
    .select({
      id: licenseKeys.id,
      companyName: companies.name,
      licenseId: licenseKeys.licenseId,
      tier: licenseKeys.tier,
      featuresJson: licenseKeys.featuresJson,
      expiresAt: licenseKeys.expiresAt,
      status: licenseKeys.status,
      maxActivations: licenseKeys.maxActivations,
      activationCount: licenseKeys.activationCount
    })
    .from(licenseKeys)
    .innerJoin(companies, eq(companies.id, licenseKeys.companyId))
    .where(and(eq(licenseKeys.activationCodeHash, hash)))
    .get();

  if (!row) {
    return {
      valid: false,
      code: 'NOT_FOUND',
      message: '激活码不存在，请检查后重试',
      license: null
    };
  }

  let code = 'OK';
  let message = '激活成功';
  let valid = true;
  const now = new Date();
  const deviceHash = machineIdHash(input.machineId);
  const existingDeviceActivation = deviceHash
    ? getDb()
      .select({ id: licenseActivationEvents.id })
      .from(licenseActivationEvents)
      .where(and(
        eq(licenseActivationEvents.licenseKeyId, row.id),
        eq(licenseActivationEvents.machineIdHash, deviceHash),
        eq(licenseActivationEvents.result, 'success')
      ))
      .get()
    : null;
  const shouldCountActivation = !existingDeviceActivation;

  if (row.status !== 'active') {
    valid = false;
    code = row.status === 'revoked' ? 'REVOKED' : 'DISABLED';
    message = row.status === 'revoked' ? '激活码已撤销' : '激活码已停用';
  } else if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) {
    valid = false;
    code = 'EXPIRED';
    message = '激活码已过期';
  } else if (row.maxActivations !== null && shouldCountActivation && row.activationCount >= row.maxActivations) {
    valid = false;
    code = 'ACTIVATION_LIMIT_REACHED';
    message = '激活数量已达上限';
  }

  if (valid && shouldCountActivation) {
    getDb()
      .update(licenseKeys)
      .set({
        activationCount: row.activationCount + 1,
        lastValidatedAt: now,
        updatedAt: now
      })
      .where(eq(licenseKeys.id, row.id))
      .run();
  } else if (valid) {
    getDb()
      .update(licenseKeys)
      .set({
        lastValidatedAt: now,
        updatedAt: now
      })
      .where(eq(licenseKeys.id, row.id))
      .run();
  }

  await recordActivationEvent({
    licenseKeyId: row.id,
    machineIdHash: deviceHash,
    machineId: input.machineId,
    appVersion: input.appVersion,
    result: valid ? 'success' : code.toLowerCase(),
    message
  });

  return {
    valid,
    code,
    message,
    license: {
      licenseId: row.licenseId,
      companyName: row.companyName,
      tier: row.tier,
      features: parseFeatures(row.featuresJson),
      expiresAt: toIso(row.expiresAt),
      status: row.status,
      maxActivations: row.maxActivations,
      activationCount: valid && shouldCountActivation ? row.activationCount + 1 : row.activationCount
    }
  };
}
