export type InstallMode = 'local' | 'remote' | 'npm';
export type InstallPhase = 'precheck' | 'running' | 'succeeded' | 'failed';
export type InstallStepState = 'done' | 'current' | 'pending' | 'failed';
export type InstallCheckState = 'ok' | 'warn' | 'error';
export type PostInstallTab = 'controls' | 'advanced-console' | 'provider' | 'channels' | 'skills' | 'settings' | 'uninstall';
export type RuntimeLifecycleState = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

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

export type InstallEnvironmentCheck = {
  id: string;
  label: string;
  state: InstallCheckState;
  detail: string;
};

export type InstallStepSnapshot = {
  id: InstallStep;
  title: string;
  description: string;
  state: InstallStepState;
};

export type InstallDashboard = {
  workflowId: string | null;
  phase: InstallPhase;
  currentStep: InstallStep | null;
  currentStepLabel: string;
  progress: number;
  completedSteps: InstallStep[];
  failedStep: InstallStep | null;
  message: string | null;
  steps: InstallStepSnapshot[];
  environment: InstallEnvironmentCheck[];
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

export type OpenClawInstallResult = {
  workflowId: string;
  installationId?: string | null;
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
  runtimeState: RuntimeLifecycleState;
  runtimePid: number | null;
  runtimeLogPath: string | null;
  gatewayReady: boolean;
  runtimeError: string | null;
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
  weixinChannel: WeixinChannelStatus;
  dingtalkChannel: DingtalkChannelStatus;
  qqbotChannel: QqbotChannelStatus;
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
  accountId: string;
  appId: string | null;
  appSecret: string | null;
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

export type WeixinChannelStatus = {
  installed: boolean;
  enabled: boolean;
  configured: boolean;
  accountId: string;
  configuredAccountIds: string[];
  baseUrl: string;
  cdnBaseUrl: string;
};

export type DingtalkChannelStatus = {
  enabled: boolean;
  configured: boolean;
  accountId: string;
  clientId: string | null;
  clientSecretConfigured: boolean;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | string;
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  requireMention: boolean;
  streaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  groupReplyMode: 'aicard' | 'text' | 'markdown' | string;
};

export type QqbotChannelStatus = {
  installed: boolean;
  enabled: boolean;
  configured: boolean;
  accountId: string;
  appId: string | null;
  clientSecretConfigured: boolean;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | string;
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  defaultRequireMention: boolean;
  transport: 'websocket' | 'webhook' | string;
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

export type OpenClawProviderConnectionTestPayload = {
  configPath: string;
  providerId: string;
  apiKey?: string;
  apiUrl?: string;
  primaryModel?: string;
};

export type OpenClawProviderConnectionTestResult = {
  providerId: string;
  apiUrl: string;
  testUrl: string;
  method: string;
  ok: boolean;
  status: number | null;
  detail: string;
};

export type OpenClawFeishuChannelSetupPayload = {
  configPath: string;
  enabled: boolean;
  domain?: string;
  connectionMode?: 'websocket' | 'webhook' | string;
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
  appId: string | null;
};

export type OpenClawDingtalkChannelSetupPayload = {
  configPath: string;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  dmPolicy?: 'open' | 'pairing' | 'allowlist' | string;
  allowFrom: string[];
  groupPolicy?: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  requireMention: boolean;
  streaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  groupReplyMode?: 'aicard' | 'text' | 'markdown' | string;
};

export type OpenClawDingtalkChannelSetupResult = {
  configPath: string;
  enabled: boolean;
  configured: boolean;
  clientId: string | null;
};

export type OpenClawQqbotChannelSetupPayload = {
  configPath: string;
  enabled: boolean;
  appId?: string;
  clientSecret?: string;
  dmPolicy?: 'open' | 'pairing' | 'allowlist' | string;
  allowFrom: string[];
  groupPolicy?: 'open' | 'allowlist' | 'disabled' | string;
  groupAllowFrom: string[];
  defaultRequireMention: boolean;
  transport?: 'websocket' | 'webhook' | string;
};

export type OpenClawQqbotChannelSetupResult = {
  configPath: string;
  enabled: boolean;
  configured: boolean;
  appId: string | null;
};

export type QqbotLoginQrStartPayload = {
  configPath: string;
  force?: boolean;
};

export type QqbotLoginQrStartResult = {
  sessionKey: string;
  qrDataUrl: string | null;
  qrLoginUrl: string | null;
  message: string;
  expiresIn: number;
};

export type QqbotLoginQrWaitPayload = {
  configPath: string;
  sessionKey: string;
  timeoutMs?: number;
};

export type QqbotLoginQrWaitResult = {
  connected: boolean;
  expired: boolean;
  message: string;
  qrDataUrl: string | null;
  expiresIn: number | null;
};

export type QqbotChannelTogglePayload = {
  configPath: string;
  enabled: boolean;
};

export type QqbotChannelToggleResult = {
  configPath: string;
  enabled: boolean;
  configured: boolean;
  accountId: string;
};

export type PluginInstallProgress = {
  stage: string;
  progress: number;
  message: string;
  done: boolean;
  failed: boolean;
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
  installType: string;
  installCommandSummary: string;
};

export type OpenClawPluginUninstallPayload = {
  configPath: string;
  pluginId: string;
};

export type OpenClawPluginUninstallResult = {
  configPath: string;
  pluginId: string;
  pluginEntryId: string;
  package: string;
  uninstallCommandSummary: string;
};

export type ManagedSkillStatus = {
  id: string;
  name: string;
  version: string;
  title: string;
  description: string;
  category: string | null;
  bundled: boolean;
  installed: boolean;
  enabled: boolean;
  installByDefault: boolean;
  enabledByDefault: boolean;
  sourceDir: string | null;
  installedPath: string | null;
  tags: string[];
};

export type ManagedSkillCatalog = {
  configPath: string;
  openclawDir: string;
  skillsDir: string;
  skills: ManagedSkillStatus[];
};

export type OpenClawSkillTogglePayload = {
  configPath: string;
  skillId: string;
  enabled: boolean;
};

export type OpenClawSkillToggleResult = {
  configPath: string;
  skillId: string;
  enabled: boolean;
};

export type PluginInstallLogEntry = {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
  createdAt: string;
};
export type OpenClawRuntimeSnapshot = {
  state: RuntimeLifecycleState;
  configPath: string | null;
  pid: number | null;
  logPath: string | null;
  startedAt: string | null;
  readyAt: string | null;
  lastError: string | null;
  adopted: boolean;
  gatewayLive: boolean;
  gatewayReady: boolean;
};

export type OpenClawLaunchResult = OpenClawRuntimeSnapshot;

export type OpenClawStopResult = OpenClawRuntimeSnapshot & {
  stopped: boolean;
};

export type OpenPathResult = string;

export type OpenExternalUrlPayload = {
  url: string;
};

export type FeishuAuthQrPayload = {
  appId: string;
  appSecret: string;
  domain: 'feishu' | 'lark' | string;
  scope?: string;
};

export type FeishuAuthQrResult = {
  deviceCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  userCode: string;
  expiresIn: number;
  interval: number;
  effectiveScope: string;
};

export type FeishuAuthQrStatusPayload = {
  appId: string;
  appSecret: string;
  domain: 'feishu' | 'lark' | string;
  deviceCode: string;
};

export type FeishuAuthQrStatusResult = {
  status: 'pending' | 'authorized' | 'expired';
  detail: string | null;
  accessTokenGranted: boolean;
  refreshTokenGranted: boolean;
  scope: string | null;
  expiresIn: number | null;
};

export type DingtalkAuthQrPayload = {
  configPath: string;
};

export type DingtalkAuthQrResult = {
  deviceCode: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

export type DingtalkAuthQrStatusPayload = {
  configPath: string;
  deviceCode: string;
};

export type DingtalkAuthQrStatusResult = {
  status: 'pending' | 'authorized' | 'expired';
  detail: string | null;
};

export type WeixinLoginStatus = {
  installed: boolean;
  enabled: boolean;
  configured: boolean;
  accountId: string;
  configuredAccountIds: string[];
  defaultBaseUrl: string;
};

export type WeixinLoginQrStartPayload = {
  configPath: string;
  accountId?: string;
  force?: boolean;
};

export type WeixinLoginQrStartResult = {
  sessionKey: string;
  qrDataUrl: string | null;
  message: string;
  expiresIn: number;
  requiresVerifyCode: boolean;
};

export type WeixinLoginQrWaitPayload = {
  configPath: string;
  sessionKey: string;
  verifyCode?: string;
  timeoutMs?: number;
};

export type WeixinLoginQrWaitResult = {
  connected: boolean;
  alreadyConnected: boolean;
  needsVerifyCode: boolean;
  verifyCodeBlocked: boolean;
  expired: boolean;
  message: string;
  qrDataUrl: string | null;
  expiresIn: number | null;
};

export type WeixinChannelTogglePayload = {
  configPath: string;
  enabled: boolean;
};

export type WeixinChannelToggleResult = {
  configPath: string;
  enabled: boolean;
  configured: boolean;
  accountId: string;
};

export type UninstallRuntimePlan = {
  running: boolean;
  pid: number | null;
  label: string;
};

export type UninstallDeletionTarget = {
  scope: string;
  path: string;
  kind: string;
  estimatedBytes: number | null;
  selectedByDefault: boolean;
  risk: 'low' | 'medium' | 'high' | string;
  reason: string;
  owned: boolean;
};

export type UninstallRetainedPath = {
  label: string;
  path: string;
  reason: string;
};

export type UninstallPlan = {
  planId: string;
  installationId: string;
  displayName: string;
  baseDir: string;
  openclawDir: string;
  runtime: UninstallRuntimePlan;
  targets: UninstallDeletionTarget[];
  retained: UninstallRetainedPath[];
  warnings: string[];
  requiresTypedConfirmation: boolean;
  confirmationText: string;
};

export type ExecuteUninstallPayload = {
  installationId: string;
  selectedScopes: string[];
  typedConfirmation?: string | null;
};

export type UninstallResult = {
  installationId: string;
  status: string;
  deletedScopes: string[];
  retained: UninstallRetainedPath[];
  warnings: string[];
};

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

export type OpenClawInstallPayload = {
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
  runtimeState: RuntimeLifecycleState;
  providerState: string;
  panelState: string;
  runtimeActionRequired: 'none' | 'reload' | 'restart' | string;
  pendingConfigChanges: string[];
  runtimePid?: number | null;
  runtimeLogPath?: string | null;
  gatewayReady?: boolean;
  runtimeHostKind?: string | null;
  installedAt: string;
  lastValidatedAt: string | null;
  lastLaunchedAt: string | null;
  lastError: string | null;
};

export type AppBootstrapState = {
  screen: 'installer' | 'installedHome' | 'recovery';
  defaultBaseDir: string;
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

export type InstallDiagnosticsInfo = {
  title: string;
  description: string;
  tasks: Array<StepDiagnosticTask & { status: DiagnosticTaskStatus }>;
};

export type InstallLogTail = {
  path: string;
  lines: string[];
  truncated: boolean;
};
