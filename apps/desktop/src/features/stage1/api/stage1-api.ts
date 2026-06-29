import { invoke } from '@tauri-apps/api/core';
import { isInstallStep } from '../model/graph';
import type {
  AppBootstrapState,
  DingtalkAuthQrPayload,
  DingtalkAuthQrResult,
  DingtalkAuthQrStatusPayload,
  DingtalkAuthQrStatusResult,
  DirectoryPickerResponse,
  FeishuAuthQrPayload,
  FeishuAuthQrResult,
  FeishuAuthQrStatusPayload,
  FeishuAuthQrStatusResult,
  InstallMode,
  OpenClawLaunchResult,
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawDingtalkChannelSetupPayload,
  OpenClawDingtalkChannelSetupResult,
  OpenClawPluginInstallPayload,
  OpenClawPluginInstallResult,
  OpenClawPluginUninstallPayload,
  OpenClawPluginUninstallResult,
  OpenClawSkillTogglePayload,
  OpenClawSkillToggleResult,
  OpenExternalUrlPayload,
  OpenClawStopResult,
  OpenPathResult,
  OpenClawPostInstallStatus,
  OpenClawProviderConnectionTestPayload,
  OpenClawProviderConnectionTestResult,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  ExecuteUninstallPayload,
  Stage1CheckState,
  Stage1Dashboard,
  Stage1InstallPayload,
  Stage1InstallLogTail,
  Stage1InstallResult,
  ManagedSkillCatalog,
  Stage1StepState,
  WeixinChannelTogglePayload,
  WeixinChannelToggleResult,
  WeixinLoginQrStartPayload,
  WeixinLoginQrStartResult,
  WeixinLoginQrWaitPayload,
  WeixinLoginQrWaitResult,
  WeixinLoginStatus,
  UninstallPlan,
  UninstallResult,
  VersionCatalogResult
} from '../model/types';

function normalizeDashboard(response: Stage1Dashboard): Stage1Dashboard {
  return {
    ...response,
    currentStep: response.currentStep && isInstallStep(response.currentStep) ? response.currentStep : null,
    failedStep: response.failedStep && isInstallStep(response.failedStep) ? response.failedStep : null,
    completedSteps: response.completedSteps.filter(isInstallStep),
    steps: response.steps.map((step) => ({
      ...step,
      id: isInstallStep(step.id) ? step.id : 'loadManifest',
      state: step.state as Stage1StepState
    })),
    environment: response.environment.map((check) => ({
      ...check,
      state: check.state as Stage1CheckState
    })),
    installMode: response.installMode as InstallMode
  };
}

export async function inspectVersionCatalog(mode: InstallMode): Promise<VersionCatalogResult> {
  return invoke<VersionCatalogResult>('inspect_version_catalog_command', {
    input: {
      installMode: mode
    }
  });
}

export async function bootstrapAppState(): Promise<AppBootstrapState> {
  return invoke<AppBootstrapState>('bootstrap_app_state_command');
}

export async function importInstallationFromPath(path: string): Promise<AppBootstrapState> {
  return invoke<AppBootstrapState>('import_installation_from_path_command', { path });
}

export async function inspectStage1Dashboard(input: Stage1InstallPayload): Promise<Stage1Dashboard> {
  const response = await invoke<Stage1Dashboard>('inspect_stage1_dashboard_command', { input });
  return normalizeDashboard(response);
}

export async function startStage1Install(input: Stage1InstallPayload): Promise<Stage1InstallResult> {
  return invoke<Stage1InstallResult>('start_stage1_install', { input });
}

export async function readStage1InstallLogTail(baseDir: string, maxLines = 200): Promise<Stage1InstallLogTail> {
  return invoke<Stage1InstallLogTail>('read_stage1_install_log_tail_command', {
    baseDir,
    maxLines
  });
}

export async function pickDirectory(defaultPath: string): Promise<DirectoryPickerResponse> {
  return invoke<DirectoryPickerResponse>('pick_directory_dialog', {
    request: {
      title: '选择 OpenClaw 安装目录',
      defaultPath
    }
  });
}

export async function pickFile(defaultPath: string): Promise<DirectoryPickerResponse> {
  return invoke<DirectoryPickerResponse>('pick_file_dialog', {
    request: {
      title: '选择 installed-manifest.json 或 OpenClaw 安装目录',
      defaultPath
    }
  });
}

export async function inspectOpenClawStatus(configPath: string): Promise<OpenClawPostInstallStatus> {
  return invoke<OpenClawPostInstallStatus>('inspect_openclaw_status', { configPath });
}

export async function setupOpenClawProvider(
  input: OpenClawProviderSetupPayload
): Promise<OpenClawProviderSetupResult> {
  return invoke<OpenClawProviderSetupResult>('setup_openclaw_provider', { input });
}

export async function testOpenClawProviderConnection(
  input: OpenClawProviderConnectionTestPayload
): Promise<OpenClawProviderConnectionTestResult> {
  return invoke<OpenClawProviderConnectionTestResult>('test_openclaw_provider_connection', {
    input
  });
}

export async function setupOpenClawFeishuChannel(
  input: OpenClawFeishuChannelSetupPayload
): Promise<OpenClawFeishuChannelSetupResult> {
  return invoke<OpenClawFeishuChannelSetupResult>('setup_openclaw_feishu_channel', { input });
}

export async function setupOpenClawDingtalkChannel(
  input: OpenClawDingtalkChannelSetupPayload
): Promise<OpenClawDingtalkChannelSetupResult> {
  return invoke<OpenClawDingtalkChannelSetupResult>('setup_openclaw_dingtalk_channel', { input });
}

export async function installOpenClawPlugin(input: OpenClawPluginInstallPayload): Promise<OpenClawPluginInstallResult> {
  return invoke<OpenClawPluginInstallResult>('install_openclaw_plugin', {
    input
  });
}

export async function uninstallOpenClawPlugin(
  input: OpenClawPluginUninstallPayload
): Promise<OpenClawPluginUninstallResult> {
  return invoke<OpenClawPluginUninstallResult>('uninstall_openclaw_plugin', {
    input
  });
}

export async function inspectOpenClawSkillCatalog(configPath: string): Promise<ManagedSkillCatalog> {
  return invoke<ManagedSkillCatalog>('inspect_openclaw_skill_catalog', {
    configPath
  });
}

export async function setOpenClawSkillEnabled(
  input: OpenClawSkillTogglePayload
): Promise<OpenClawSkillToggleResult> {
  return invoke<OpenClawSkillToggleResult>('set_openclaw_skill_enabled', {
    input
  });
}

export async function launchOpenClawRuntime(configPath: string): Promise<OpenClawLaunchResult> {
  return invoke<OpenClawLaunchResult>('launch_openclaw_runtime', { configPath });
}

export async function stopOpenClawRuntime(
  configPath: string,
  pid?: number | null
): Promise<OpenClawStopResult> {
  return invoke<OpenClawStopResult>('stop_openclaw_runtime', { configPath, pid });
}

export async function restartOpenClawRuntime(
  configPath: string,
  pid?: number | null
): Promise<OpenClawLaunchResult> {
  return invoke<OpenClawLaunchResult>('restart_openclaw_runtime', { configPath, pid });
}

export async function readOpenClawRuntimeLogTail(
  logPath: string,
  maxLines = 200
): Promise<Stage1InstallLogTail> {
  return invoke<Stage1InstallLogTail>('read_openclaw_runtime_log_tail', {
    logPath,
    maxLines
  });
}

export async function openControlPanel(configPath: string): Promise<string> {
  return invoke<string>('open_control_panel_command', { configPath });
}

export async function openInstallationDirectory(path: string): Promise<OpenPathResult> {
  return invoke<OpenPathResult>('open_installation_directory_command', { path });
}

export async function openLogsDirectory(configPath: string): Promise<OpenPathResult> {
  return invoke<OpenPathResult>('open_logs_directory_command', { configPath });
}

export async function openExternalUrl(input: OpenExternalUrlPayload): Promise<OpenPathResult> {
  return invoke<OpenPathResult>('open_external_url_command', { input });
}

export async function createFeishuAuthQr(input: FeishuAuthQrPayload): Promise<FeishuAuthQrResult> {
  return invoke<FeishuAuthQrResult>('create_feishu_auth_qr_command', { input });
}

export async function inspectFeishuAuthQrStatus(input: FeishuAuthQrStatusPayload): Promise<FeishuAuthQrStatusResult> {
  return invoke<FeishuAuthQrStatusResult>('inspect_feishu_auth_qr_status_command', { input });
}

export async function createDingtalkAuthQr(input: DingtalkAuthQrPayload): Promise<DingtalkAuthQrResult> {
  return invoke<DingtalkAuthQrResult>('create_dingtalk_auth_qr_command', { input });
}

export async function inspectDingtalkAuthQrStatus(
  input: DingtalkAuthQrStatusPayload
): Promise<DingtalkAuthQrStatusResult> {
  return invoke<DingtalkAuthQrStatusResult>('inspect_dingtalk_auth_qr_status_command', { input });
}

export async function inspectWeixinLoginStatus(configPath: string): Promise<WeixinLoginStatus> {
  return invoke<WeixinLoginStatus>('inspect_weixin_login_status_command', { configPath });
}

export async function startWeixinLoginQr(
  input: WeixinLoginQrStartPayload
): Promise<WeixinLoginQrStartResult> {
  return invoke<WeixinLoginQrStartResult>('start_weixin_login_qr_command', { input });
}

export async function waitForWeixinLoginQr(
  input: WeixinLoginQrWaitPayload
): Promise<WeixinLoginQrWaitResult> {
  return invoke<WeixinLoginQrWaitResult>('wait_for_weixin_login_qr_command', { input });
}

export async function setWeixinChannelEnabled(
  input: WeixinChannelTogglePayload
): Promise<WeixinChannelToggleResult> {
  return invoke<WeixinChannelToggleResult>('set_weixin_channel_enabled_command', { input });
}

export async function inspectUninstallPlan(installationId: string): Promise<UninstallPlan> {
  return invoke<UninstallPlan>('inspect_uninstall_plan_command', { installationId });
}

export async function executeUninstall(input: ExecuteUninstallPayload): Promise<UninstallResult> {
  return invoke<UninstallResult>('execute_uninstall_command', { input });
}
