import path from 'node:path';
import fs from 'fs-extra';
import {
  installedManifestSchema,
  providerCatalogManifestSchema,
  releaseManifestSchema,
  toolkitManifestSchema,
  type InstalledManifest,
  type ProviderCatalogManifest,
  type ReleaseManifest,
  type ToolkitManifest
} from '@openclaw-toolkit/schemas';

export async function loadToolkitManifest(projectRoot: string): Promise<ToolkitManifest> {
  const filePath = path.join(projectRoot, 'artifacts', 'toolkit-manifest.json');
  return toolkitManifestSchema.parse(await fs.readJson(filePath));
}

export async function loadReleaseManifest(projectRoot: string): Promise<ReleaseManifest> {
  const filePath = path.join(projectRoot, 'artifacts', 'manifest.json');
  return releaseManifestSchema.parse(await fs.readJson(filePath));
}

export async function loadProviderCatalog(projectRoot: string): Promise<ProviderCatalogManifest> {
  const filePath = path.join(projectRoot, 'artifacts', 'providers.json');
  return providerCatalogManifestSchema.parse(await fs.readJson(filePath));
}

export async function writeInstalledManifest(filePath: string, manifest: InstalledManifest): Promise<void> {
  const parsed = installedManifestSchema.parse(manifest);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, parsed, { spaces: 2 });
}
