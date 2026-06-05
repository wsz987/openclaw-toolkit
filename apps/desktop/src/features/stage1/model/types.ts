export type InstallMode = 'local' | 'remote' | 'npm';
export type Stage1Phase = 'precheck' | 'running' | 'succeeded' | 'failed';
export type Stage1StepState = 'done' | 'current' | 'pending' | 'failed';
export type Stage1CheckState = 'ok' | 'warn' | 'error';
export type PostInstallTab = 'controls' | 'advanced-console' | 'provider' | 'channels';

export type InstallStep =
  | 'loadManifest'
  | 'validateLicense'
  | 'checkEnvironment'
  | 'selectInstallMode'
  | 'resolveOpenClawVersion'
  | 'resolveNodeRuntime'
  | 'installNodeRuntime'
  | 'resolveOpenClawArtifact'
  | 'installOpenClaw'
  | 'writeInstalledManifest'
  | 'generateOpenClawConfig'
  | 'installSkills'
  | 'configurePermissions'
  | 'configureBrowser'
  | 'verifyRuntime';

export type Stage1EnvironmentCheck = {
  id: string;
  label: string;
  state: Stage1CheckState;
  detail: string;
};

export type Stage1StepSnapshot = {
  id: InstallStep;
  title: string;
  description: string;
  state: Stage1StepState;
};

export type Stage1Dashboard = {
  workflowId: string | null;
  phase: Stage1Phase;
  currentStep: InstallStep | null;
  currentStepLabel: string;
  progress: number;
  completedSteps: InstallStep[];
  failedStep: InstallStep | null;
  message: string | null;
  steps: Stage1StepSnapshot[];
  environment: Stage1EnvironmentCheck[];
  installMode: InstallMode;
  selectedVersion: string;
  openclawVersion: string | null;
  nodeVersion: string | null;
  baseDir: string;
  systemOpenclaw: {
    detected: boolean;
    executable: string | null;
    version: string | null;
    error: string | null;
  };
  systemNode: {
    detected: boolean;
    executable: string | null;
    version: string | null;
    satisfiesRequirement: boolean | null;
    error: string | null;
  };
  installPlan: {
    targetOpenclawVersion: string | null;
    targetNodeVersion: string | null;
    action: string;
    requiresConfirmation: boolean;
  };
};

export type Stage1InstallResult = {
  workflowId: string;
  status: string;
  openclawVersion: string;
  nodeVersion: string;
  openclawDir: string;
  nodeDir: string;
  configPath: string;
};

export type OpenClawPostInstallStatus = {
  openclawDir: string;
  nodeDir: string;
  configPath: string;
  workspaceDir: string;
  gatewayUrl: string;
  controlUiUrl: string;
  runtimeState: string;
  runtimePid: number | null;
  runtimeLogPath: string | null;
  runtimeActionRequired: 'none' | 'reload' | 'restart' | string;
  pendingConfigChanges: string[];
  runtimeRunning: boolean;
  panelReachable: boolean;
  providerInitialized: boolean;
  providerId: string | null;
  providerModel: string | null;
  providerApiUrl: string | null;
  availableProviders: ProviderCatalogEntry[];
  feishuPluginEnabled: boolean;
  feishuChannel: FeishuChannelStatus;
  skillsInstalled: string[];
  pluginsEnabled: string[];
  installedPlugins: InstalledPluginStatus[];
};

export type InstalledPluginStatus = {
  id: string;
  version: string;
  package?: string;
};

export type FeishuChannelStatus = {
  enabled: boolean;
  configured: boolean;
  domain: string;
  connectionMode: 'websocket' | 'webhook' | string;
  defaultAccount: string;
  accountId: string;
  accountName: string | null;
  appId: string | null;
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled' | string;
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  requireMention: boolean;
  streaming: boolean;
  blockStreaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  verificationTokenConfigured: boolean;
  encryptKeyConfigured: boolean;
  webhookPath: string | null;
  webhookHost: string | null;
  webhookPort: number | null;
};

export type ProviderCatalogModelEntry = {
  id: string;
  name: string;
  input: string[];
  contextWindow?: number;
  maxTokens?: number;
};

export type ProviderCatalogEntry = {
  id: string;
  label: string;
  api: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnv: string | null;
  aliases: string[];
  models: ProviderCatalogModelEntry[];
};

export type OpenClawProviderSetupPayload = {
  configPath: string;
  providerId: string;
  apiKey: string;
  apiUrl?: string;
  primaryModel?: string;
  grantAgentPermissions: boolean;
};

export type OpenClawProviderSetupResult = {
  configPath: string;
  providerId: string;
  primaryModel: string;
  apiUrl: string;
  agentPermissionsGranted: boolean;
};

export type OpenClawFeishuChannelSetupPayload = {
  configPath: string;
  enabled: boolean;
  domain?: string;
  connectionMode?: 'websocket' | 'webhook' | string;
  defaultAccount?: string;
  accountName?: string;
  appId?: string;
  appSecret?: string;
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled' | string;
  allowFrom: string[];
  groupPolicy?: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  requireMention: boolean;
  streaming: boolean;
  blockStreaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  verificationToken?: string;
  encryptKey?: string;
  webhookPath?: string;
  webhookHost?: string;
  webhookPort?: number;
};

export type OpenClawFeishuChannelSetupResult = {
  configPath: string;
  enabled: boolean;
  configured: boolean;
  connectionMode: string;
  defaultAccount: string;
  appId: string | null;
};

export type OpenClawPluginInstallPayload = {
  configPath: string;
  pluginId: string;
};

export type OpenClawPluginInstallResult = {
  configPath: string;
  pluginId: string;
  pluginEntryId: string;
  package: string;
  version: string;
  artifactPath: string;
};

export type PluginInstallLogEntry = {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
  createdAt: string;
};

export type OpenClawLaunchResult = {
  pid: number;
  logPath: string;
};

export type OpenClawStopResult = {
  stopped: boolean;
};

export type OpenPathResult = string;

export type VersionCatalogOption = {
  value: string;
  label: string;
  detail: string;
  selectable: boolean;
  actualVersion: string | null;
};

export type VersionCatalogResult = {
  installMode: InstallMode;
  sourceReady: boolean;
  defaultValue: string;
  latestVersion: string | null;
  options: VersionCatalogOption[];
  message: string | null;
};

export type DirectoryPickerResponse = string | null;

export type Stage1InstallPayload = {
  baseDir: string;
  licenseKey: string;
  installMode: InstallMode;
  selectedVersion: string;
};

export type InstallationRecord = {
  installationId: string;
  displayName: string;
  baseDir: string;
  openclawDir: string;
  nodeDir: string;
  configPath: string;
  installedManifestPath: string;
  installMode: InstallMode;
  openclawVersion: string;
  nodeVersion: string;
  status: string;
  configState: string;
  runtimeState: string;
  providerState: string;
  panelState: string;
  runtimeActionRequired: 'none' | 'reload' | 'restart' | string;
  pendingConfigChanges: string[];
  runtimePid?: number | null;
  runtimeLogPath?: string | null;
  installedAt: string;
  lastValidatedAt: string | null;
  lastLaunchedAt: string | null;
  lastError: string | null;
};

export type AppBootstrapState = {
  screen: 'installer' | 'installedHome' | 'recovery';
  settings: {
    schemaVersion: number;
    lastSelectedBaseDir: string | null;
    activeInstallationId: string | null;
    recentInstallationIds: string[];
  };
  activeInstallation: InstallationRecord | null;
  status: OpenClawPostInstallStatus | null;
  message: string | null;
};

export type MasterPhaseId = 'verify-pre' | 'dependencies' | 'config-write' | 'final-check';

export interface MasterPhase {
  id: MasterPhaseId;
  label: string;
  steps: InstallStep[];
}

export interface StepDiagnosticTask {
  label: string;
  key: string;
}

export interface StepDiagnostic {
  title: string;
  description: string;
  tasks: StepDiagnosticTask[];
}

export type DiagnosticTaskStatus = 'checked' | 'pending' | 'waiting';

export type Stage1DiagnosticsInfo = {
  title: string;
  description: string;
  tasks: Array<StepDiagnosticTask & { status: DiagnosticTaskStatus }>;
};

export type Stage1InstallLogTail = {
  path: string;
  lines: string[];
  truncated: boolean;
};
