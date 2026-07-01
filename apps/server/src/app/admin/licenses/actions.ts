'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { issueLicenseKey, setLicenseKeyStatus } from '@/lib/license-repository';
import { DEFAULT_LICENSE_FEATURES, DEFAULT_LICENSE_TIER } from '@/lib/license-input';

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value || null;
}

function dateValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value ? new Date(`${value}T23:59:59.000Z`).toISOString() : null;
}

function featuresValue(formData: FormData) {
  const value = stringValue(formData, 'features');
  if (!value) {
    return DEFAULT_LICENSE_FEATURES;
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value ? Number(value) : null;
}

export async function issueLicenseKeyAction(formData: FormData) {
  const companyId = optionalString(formData, 'companyId');
  const companyName = optionalString(formData, 'companyName');

  const issued = await issueLicenseKey({
    companyId: companyId ?? undefined,
    companyName: companyName ?? undefined,
    tier: stringValue(formData, 'tier') || DEFAULT_LICENSE_TIER,
    features: featuresValue(formData),
    expiresAt: dateValue(formData, 'expiresAt'),
    maxActivations: numberValue(formData, 'maxActivations'),
    activationCode: optionalString(formData, 'activationCode') ?? undefined,
    note: optionalString(formData, 'note'),
    issuedBy: optionalString(formData, 'issuedBy')
  });

  revalidatePath('/admin/licenses');
  const params = new URLSearchParams({
    issuedCode: issued.activationCode,
    licenseId: issued.licenseKey.licenseId,
    company: issued.company.name
  });
  redirect(`/admin/licenses?${params.toString()}`);
}

export async function setLicenseKeyStatusAction(formData: FormData) {
  const id = stringValue(formData, 'id');
  const status = stringValue(formData, 'status');
  if (!id) {
    throw new Error('id is required.');
  }
  if (status !== 'active' && status !== 'disabled' && status !== 'revoked') {
    throw new Error('status is invalid.');
  }

  await setLicenseKeyStatus(id, status);
  revalidatePath('/admin/licenses');
}
