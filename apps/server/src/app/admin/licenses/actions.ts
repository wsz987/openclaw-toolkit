'use server';

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { issueLicenseKey, setLicenseKeyStatus } from '@/lib/license-repository';
import { DEFAULT_LICENSE_FEATURES } from '@/lib/license-input';

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value || null;
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
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
  const issueOfflineLicense = booleanValue(formData, 'issueOfflineLicense');
  const offlineSigningPrivateKeyPem = stringValue(formData, 'offlineSigningPrivateKeyPem');

  const issued = await issueLicenseKey({
    companyId: companyId ?? undefined,
    companyName: companyName ?? undefined,
    tier: stringValue(formData, 'tier') || 'stage-1',
    features: featuresValue(formData),
    expiresAt: dateValue(formData, 'expiresAt'),
    maxActivations: numberValue(formData, 'maxActivations'),
    activationCode: optionalString(formData, 'activationCode') ?? undefined,
    note: optionalString(formData, 'note'),
    issuedBy: optionalString(formData, 'issuedBy'),
    issueOfflineLicense,
    offlineSigningPrivateKeyPem: offlineSigningPrivateKeyPem || undefined
  });

  let offlinePath: string | null = null;
  if (issued.offlineLicense) {
    const bundleDir = resolve(process.cwd(), 'data', 'license-bundles', issued.licenseKey.licenseId);
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(resolve(bundleDir, 'activation-code.txt'), `${issued.activationCode}\n`);
    writeFileSync(resolve(bundleDir, 'license.dat'), `${JSON.stringify(issued.offlineLicense, null, 2)}\n`);
    offlinePath = bundleDir;
  }

  revalidatePath('/admin/licenses');
  const params = new URLSearchParams({
    issuedCode: issued.activationCode,
    licenseId: issued.licenseKey.licenseId,
    company: issued.company.name
  });
  if (offlinePath) {
    params.set('offlinePath', offlinePath);
  }
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
