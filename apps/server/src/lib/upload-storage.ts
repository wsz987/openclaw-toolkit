import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { DEFAULT_PUBLIC_BASE_URL, RELEASE_STORAGE_DIR } from './env';

export type StoredReleaseAsset = {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  publicUrl: string;
  sha256: string;
};

export function sanitizeFileName(fileName: string) {
  const name = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  return name || `asset${extname(fileName)}`;
}

export async function storeReleaseAsset(input: {
  file: File;
  version: string;
  target: string;
  arch: string;
  publicBaseUrl?: string | null;
}): Promise<StoredReleaseAsset> {
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const fileName = sanitizeFileName(input.file.name);
  const relativePath = `${input.version}/${input.target}-${input.arch}/${fileName}`;
  const storageRoot = resolve(process.cwd(), RELEASE_STORAGE_DIR);
  const absolutePath = join(storageRoot, relativePath);

  await mkdir(join(storageRoot, input.version, `${input.target}-${input.arch}`), { recursive: true });
  await writeFile(absolutePath, bytes);

  const baseUrl = (input.publicBaseUrl || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, '');
  return {
    fileName,
    relativePath,
    absolutePath,
    publicUrl: `${baseUrl}/api/v1/desktop/downloads/${relativePath.replaceAll('\\', '/')}`,
    sha256
  };
}

export async function readStoredReleaseAsset(relativePath: string) {
  const storageRoot = resolve(process.cwd(), RELEASE_STORAGE_DIR);
  const absolutePath = resolve(storageRoot, relativePath);
  if (!absolutePath.startsWith(storageRoot)) {
    throw new Error('Invalid release asset path.');
  }

  return readFile(absolutePath);
}
