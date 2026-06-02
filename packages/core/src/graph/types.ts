import type { InstallMode, ServiceTier } from '@openclaw-toolkit/shared';
import type {
  LicensePayload,
  ProviderCatalogManifest,
  ReleaseArtifact,
  ReleaseManifest,
  ToolkitManifest
} from '@openclaw-toolkit/schemas';

export interface WorkflowContext {
  workflowId: string;
  projectRoot: string;
  runtimeDir: string;
  nodeDir?: string;
  configPath: string;
  licenseKey?: string;
  license?: LicensePayload;
  tier?: ServiceTier;
  installMode?: InstallMode;
  selectedVersion?: string;
  toolkitManifest?: ToolkitManifest;
  providerCatalog?: ProviderCatalogManifest;
  releaseManifest?: ReleaseManifest;
  artifact?: ReleaseArtifact;
  errors: string[];
}

export interface WorkflowStep<I = unknown, O = unknown> {
  id: string;
  title: string;
  description: string;
  run(ctx: WorkflowContext, input?: I): Promise<O>;
  rollback?: (ctx: WorkflowContext) => Promise<void>;
}
