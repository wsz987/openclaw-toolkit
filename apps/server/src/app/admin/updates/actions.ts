'use server';

import { revalidatePath } from 'next/cache';
import { createDesktopRelease, setReleaseEnabled, setUpdateServerSetting } from '@/lib/release-repository';
import { storeReleaseAsset } from '@/lib/upload-storage';

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

export async function saveUpdateServerConfigAction(formData: FormData) {
  const publicBaseUrl = stringValue(formData, 'publicBaseUrl');
  if (!publicBaseUrl) {
    throw new Error('publicBaseUrl is required.');
  }

  await setUpdateServerSetting('publicBaseUrl', publicBaseUrl);
  revalidatePath('/admin/updates');
}

export async function createDesktopReleaseAction(formData: FormData) {
  const version = stringValue(formData, 'version');
  const channel = stringValue(formData, 'channel') || 'stable';
  const target = stringValue(formData, 'target') || 'windows';
  const arch = stringValue(formData, 'arch') || 'x86_64';
  const notes = stringValue(formData, 'notes') || null;
  const signatureText = stringValue(formData, 'signatureText');
  const publicBaseUrl = stringValue(formData, 'publicBaseUrl') || null;
  const enabled = booleanValue(formData, 'enabled');
  const assetEnabled = booleanValue(formData, 'assetEnabled');
  const assetFile = formData.get('assetFile');
  const signatureFile = formData.get('signatureFile');

  if (!version) {
    throw new Error('version is required.');
  }
  if (!(assetFile instanceof File) || assetFile.size === 0) {
    throw new Error('assetFile is required.');
  }
  let signature = signatureText;
  if (!signature && signatureFile instanceof File && signatureFile.size > 0) {
    signature = (await signatureFile.text()).trim();
  }
  if (!signature) {
    throw new Error('signature is required.');
  }

  const storedAsset = await storeReleaseAsset({
    file: assetFile,
    version,
    target,
    arch,
    publicBaseUrl
  });

  await createDesktopRelease({
    version,
    channel,
    enabled,
    notes,
    pubDate: new Date(),
    asset: {
      target,
      arch,
      url: storedAsset.publicUrl,
      signature,
      sha256: storedAsset.sha256,
      enabled: assetEnabled
    }
  });

  revalidatePath('/admin/updates');
}

export async function setReleaseEnabledAction(formData: FormData) {
  const releaseId = stringValue(formData, 'releaseId');
  const enabled = booleanValue(formData, 'enabled');
  if (!releaseId) {
    throw new Error('releaseId is required.');
  }

  await setReleaseEnabled(releaseId, enabled);
  revalidatePath('/admin/updates');
}
