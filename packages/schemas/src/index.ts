import { z } from 'zod';

export const serviceTierSchema = z.enum(['stage-1', 'stage-2']);
export const installModeSchema = z.enum(['local', 'remote', 'npm']);

export const toolkitManifestSchema = z.object({
  toolkitVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  defaultOpenClawVersion: z.string().min(1),
  supportedOpenClawVersions: z.array(z.string().min(1)).min(1),
  environment: z.object({
    windows: z.object({
      minVersion: z.string().min(1)
    }).optional()
  }).optional()
});

export const releaseSkillSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
});

export const requiredNodeRuntimeSchema = z.object({
  version: z.string().min(1),
  range: z.string().min(1),
  artifact: z.string().min(1),
  sha256: z.string().min(1),
  signature: z.string().optional()
});

export const releaseArtifactSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.literal('win32-x64'),
  artifact: z.string().min(1),
  sha256: z.string().min(1),
  signature: z.string().optional(),
  requiredNode: requiredNodeRuntimeSchema,
  skills: z.array(releaseSkillSchema).default([])
});

export const releaseManifestSchema = z.object({
  releases: z.array(releaseArtifactSchema).min(1)
});

export const installedManifestSchema = z.object({
  toolkitVersion: z.string().min(1),
  openclawVersion: z.string().min(1),
  installMode: installModeSchema,
  installedAt: z.string().min(1),
  runtimeDir: z.string().min(1),
  configPath: z.string().min(1),
  skills: z.array(releaseSkillSchema).default([])
});

export const licensePayloadSchema = z.object({
  licenseId: z.string().min(1),
  customer: z.string().min(1),
  tier: serviceTierSchema,
  expiresAt: z.string().min(1),
  features: z.array(z.string()).default([]),
  maxOpenClawVersion: z.string().optional()
});

export type ToolkitManifest = z.infer<typeof toolkitManifestSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type RequiredNodeRuntime = z.infer<typeof requiredNodeRuntimeSchema>;
export type ReleaseArtifact = z.infer<typeof releaseArtifactSchema>;
export type InstalledManifest = z.infer<typeof installedManifestSchema>;
export type LicensePayload = z.infer<typeof licensePayloadSchema>;
