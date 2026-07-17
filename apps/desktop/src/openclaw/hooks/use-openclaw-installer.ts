import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLatestRequestGuard } from '@/hooks/use-latest-request-guard';
import { STEP1_CHECK_IDS, STEP2_CHECK_IDS, STEP3_SPLIT_INDEX } from '@/openclaw/model/graph';
import {
  installerSteps,
  isInstallStep,
} from '@/openclaw/model/graph';
import type { InstallerWizardStep } from '@/openclaw/model/app-flow';
import {
  buildDiagnosticsInfo,
  createPendingStepProgress,
  deriveWizardStepFromDashboard,
  getConfirmationDescription,
  getConfirmationTargetVersion,
  getInstallActionLabel,
  getInstallPlan,
  getPhase,
  getReadyCheckCount,
  getSelectedVersionOption,
  getStepChecks,
  getSystemOpenClaw,
  isVersionListReady
} from '@/openclaw/model/selectors';
import type {
  InstallMode,
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawDingtalkChannelSetupPayload,
  OpenClawDingtalkChannelSetupResult,
  OpenClawQqbotChannelSetupPayload,
  OpenClawQqbotChannelSetupResult,
  OpenClawPluginInstallPayload,
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  OpenClawSkillTogglePayload,
  PluginInstallLogEntry,
  ManagedSkillCatalog,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  OpenClawStopResult,
  InstallDashboard,
  InstallLogTail,
  OpenClawInstallPayload,
  OpenClawInstallResult,
  UninstallPlan,
  UninstallResult,
  VersionCatalogResult
} from '@/openclaw/model/types';
import {
  executeUninstall,
  importInstallationFromPath,
  installOpenClawPlugin,
  inspectUninstallPlan,
  inspectOpenClawSkillCatalog,
  inspectOpenClawStatus,
  inspectInstallDashboard,
  inspectVersionCatalog,
  launchOpenClawRuntime,
  openControlPanel,
  openInstallationDirectory,
  openLogsDirectory,
  pickDirectory,
  readInstallLogTail,
  restartOpenClawRuntime,
  setOpenClawSkillEnabled,
  setupOpenClawFeishuChannel,
  setupOpenClawDingtalkChannel,
  setupOpenClawQqbotChannel,
  setupOpenClawProvider,
  stopOpenClawRuntime,
  startOpenClawInstall
} from '@/openclaw/api/client';
import {
  isOpenClawStatusEventAvailable,
  refreshOpenClawStatus
} from '@/openclaw/model/status-store';

const DEFAULT_TOOLKIT_INSTALL_DIR_NAME = 'OpenClaw Toolkit';

function normalizePickedBaseDir(path: string) {
  const trimmed = path.trim();
  const driveRoot = /^([a-zA-Z]):[\\/]*$/.exec(trimmed);
  if (!driveRoot) {
    return path;
  }

  return `${driveRoot[1].toUpperCase()}:\\${DEFAULT_TOOLKIT_INSTALL_DIR_NAME}`;
}

export function useOpenClawInstaller(
  initialBaseDir?: string | null,
  initialConfigPath?: string | null,
  initialShowPostInstallHome = false,
  initialWizardStep: InstallerWizardStep = 0
) {
  const DASHBOARD_DEBOUNCE_MS = 350;
  const fallbackBaseDir = 'D:\\OpenClaw';

  const [baseDir, setBaseDir] = useState(initialBaseDir && initialBaseDir.trim().length > 0 ? initialBaseDir : fallbackBaseDir);
  const [licenseKey, setLicenseKey] = useState('');
  const [installMode, setInstallMode] = useState<InstallMode>('local');
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<InstallDashboard | null>(null);
  const [versionCatalogLoading, setVersionCatalogLoading] = useState(false);
  const [versionCatalog, setVersionCatalog] = useState<VersionCatalogResult | null>(null);
  const [result, setResult] = useState<OpenClawInstallResult | null>(null);
  const [installLogTail, setInstallLogTail] = useState<InstallLogTail | null>(null);
  const [postInstallStatus, setPostInstallStatus] = useState<OpenClawPostInstallStatus | null>(null);
  const [postInstallLoading, setPostInstallLoading] = useState(false);
  const [providerSetupLoading, setProviderSetupLoading] = useState(false);
  const [feishuSetupLoading, setFeishuSetupLoading] = useState(false);
  const [feishuSetupResult, setFeishuSetupResult] = useState<OpenClawFeishuChannelSetupResult | null>(null);
  const [dingtalkSetupLoading, setDingtalkSetupLoading] = useState(false);
  const [dingtalkSetupResult, setDingtalkSetupResult] = useState<OpenClawDingtalkChannelSetupResult | null>(null);
  const [qqbotSetupLoading, setQqbotSetupLoading] = useState(false);
  const [qqbotSetupResult, setQqbotSetupResult] = useState<OpenClawQqbotChannelSetupResult | null>(null);
  const [pluginInstallLoading, setPluginInstallLoading] = useState(false);
  const [pluginInstallResult, setPluginInstallResult] = useState<OpenClawPluginInstallResult | null>(null);
  const [pluginInstallLogs, setPluginInstallLogs] = useState<PluginInstallLogEntry[]>([]);
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(false);
  const [skillCatalog, setSkillCatalog] = useState<ManagedSkillCatalog | null>(null);
  const [skillToggleLoadingIds, setSkillToggleLoadingIds] = useState<string[]>([]);
  const [runtimeLaunchLoading, setRuntimeLaunchLoading] = useState(false);
  const [runtimeStopLoading, setRuntimeStopLoading] = useState(false);
  const [runtimeRestartLoading, setRuntimeRestartLoading] = useState(false);
  const [controlPanelOpening, setControlPanelOpening] = useState(false);
  const [installationDirOpening, setInstallationDirOpening] = useState(false);
  const [logsDirOpening, setLogsDirOpening] = useState(false);
  const [importingInstallation, setImportingInstallation] = useState(false);
  const [uninstallPlanLoading, setUninstallPlanLoading] = useState(false);
  const [uninstallExecuting, setUninstallExecuting] = useState(false);
  const [uninstallPlan, setUninstallPlan] = useState<UninstallPlan | null>(null);
  const [uninstallResult, setUninstallResult] = useState<UninstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<InstallerWizardStep>(initialWizardStep);
  const [showPostInstallHome, setShowPostInstallHome] = useState(initialShowPostInstallHome);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const installPollingInFlightRef = useRef(false);
  const dashboardRequestGuard = useLatestRequestGuard();
  const versionCatalogRequestGuard = useLatestRequestGuard();
  const postInstallStatusRequestGuard = useLatestRequestGuard();
  const providerSetupRequestGuard = useLatestRequestGuard();
  const feishuSetupRequestGuard = useLatestRequestGuard();
  const dingtalkSetupRequestGuard = useLatestRequestGuard();
  const qqbotSetupRequestGuard = useLatestRequestGuard();
  const pluginInstallRequestGuard = useLatestRequestGuard();
  const skillCatalogRequestGuard = useLatestRequestGuard();
  const runtimeLaunchRequestGuard = useLatestRequestGuard();
  const runtimeStopRequestGuard = useLatestRequestGuard();
  const runtimeRestartRequestGuard = useLatestRequestGuard();
  const installLogRequestGuard = useLatestRequestGuard();
  const uninstallPlanRequestGuard = useLatestRequestGuard();
  const uninstallExecuteRequestGuard = useLatestRequestGuard();

  const payload = useMemo<OpenClawInstallPayload>(
    () => ({
      baseDir,
      licenseKey,
      installMode,
      selectedVersion
    }),
    [baseDir, licenseKey, installMode, selectedVersion]
  );
  const debouncedPayload = useDebouncedValue(payload, DASHBOARD_DEBOUNCE_MS);

  async function loadVersionCatalog(mode: InstallMode, preserveSelection = true) {
    const requestId = versionCatalogRequestGuard.begin();
    setVersionCatalogLoading(true);
    try {
      const response = await inspectVersionCatalog(mode);

      if (!versionCatalogRequestGuard.isCurrent(requestId)) {
        return;
      }

      setVersionCatalog(response);
      setSelectedVersion((current) => {
        if (!preserveSelection) {
          return response.defaultValue;
        }

        const currentOption = response.options.find((option) => option.value === current);
        return currentOption?.selectable ? current : response.defaultValue;
      });
    } catch (err) {
      if (!versionCatalogRequestGuard.isCurrent(requestId)) {
        return;
      }

      setVersionCatalog({
        installMode: mode,
        sourceReady: false,
        defaultValue: 'latest',
        latestVersion: null,
        options: [],
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      if (versionCatalogRequestGuard.isCurrent(requestId)) {
        setVersionCatalogLoading(false);
      }
    }
  }

  async function loadDashboard(input: OpenClawInstallPayload) {
    const requestId = dashboardRequestGuard.begin();
    setError(null);
    setDashboardLoading(true);

    try {
      const response = await inspectInstallDashboard(input);

      if (!dashboardRequestGuard.isCurrent(requestId)) {
        return;
      }

      setDashboard(response);
    } catch (err) {
      if (!dashboardRequestGuard.isCurrent(requestId)) {
        return;
      }

      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (dashboardRequestGuard.isCurrent(requestId)) {
        setDashboardLoading(false);
      }
    }
  }

  async function loadInstallLog(baseDirToRead: string) {
    if (!baseDirToRead.trim()) {
      return;
    }

    const requestId = installLogRequestGuard.begin();
    try {
      const response = await readInstallLogTail(baseDirToRead, 200);
      if (!installLogRequestGuard.isCurrent(requestId)) {
        return;
      }

      setInstallLogTail(response);
    } catch {
      if (!installLogRequestGuard.isCurrent(requestId)) {
        return;
      }

      setInstallLogTail(null);
    }
  }

  async function loadPostInstallStatus(configPath: string) {
    if (!configPath.trim()) {
      setPostInstallStatus(null);
      return null;
    }

    const requestId = postInstallStatusRequestGuard.begin();
    setPostInstallLoading(true);

    try {
      const response = await inspectOpenClawStatus(configPath);
      if (!postInstallStatusRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setPostInstallStatus(response);
      return response;
    } catch (err) {
      if (!postInstallStatusRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (postInstallStatusRequestGuard.isCurrent(requestId)) {
        setPostInstallLoading(false);
      }
    }
  }

  async function refreshStatusSnapshot(configPath: string) {
    if (!configPath.trim()) {
      return;
    }

    await refreshOpenClawStatus(configPath);
  }

  async function finalizePostInstallMutation(configPath: string) {
    await refreshStatusSnapshot(configPath);
    handleEnterPostInstallHome();
  }

  async function loadSkillCatalog(configPath: string) {
    if (!configPath.trim()) {
      setSkillCatalog(null);
      return null;
    }

    const requestId = skillCatalogRequestGuard.begin();
    setSkillCatalogLoading(true);
    console.info(`[Skill 管理] 开始读取内置 skill 清单：${configPath}`);

    try {
      const response = await inspectOpenClawSkillCatalog(configPath);
      if (!skillCatalogRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setSkillCatalog(response);
      console.info(`[Skill 管理] 清单读取完成：共 ${response.skills.length} 个 skill。`);
      return response;
    } catch (err) {
      if (!skillCatalogRequestGuard.isCurrent(requestId)) {
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Skill 管理] 清单读取失败：${message}`);
      setError(message);
      setSkillCatalog(null);
      return null;
    } finally {
      if (skillCatalogRequestGuard.isCurrent(requestId)) {
        setSkillCatalogLoading(false);
      }
    }
  }

  async function handleSkillToggle(input: OpenClawSkillTogglePayload) {
    const skillId = input.skillId;
    setError(null);
    setSkillToggleLoadingIds((current) => Array.from(new Set([...current, skillId])));
    console.info(`[Skill 管理] 准备${input.enabled ? '启用' : '关闭'} skill：${skillId}`);

    try {
      const response = await setOpenClawSkillEnabled(input);
      console.info(`[Skill 管理] skill ${response.skillId} 已${response.enabled ? '启用' : '关闭'}，正在刷新清单。`);
      await loadSkillCatalog(response.configPath);
      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Skill 管理] skill ${skillId} 切换失败：${message}`);
      setError(message);
      return null;
    } finally {
      setSkillToggleLoadingIds((current) => current.filter((id) => id !== skillId));
    }
  }

  function appendPluginInstallLog(level: PluginInstallLogEntry['level'], message: string) {
    const entry: PluginInstallLogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level,
      message,
      createdAt: new Date().toISOString()
    };

    setPluginInstallLogs((current) => [...current.slice(-39), entry]);

    if (level === 'error') {
      console.error(`[聊天渠道][插件安装] ${message}`);
      return;
    }

    if (level === 'success') {
      console.info(`[聊天渠道][插件安装] ${message}`);
      return;
    }

    console.log(`[聊天渠道][插件安装] ${message}`);
  }

  async function handlePickDirectory() {
    const picked = await pickDirectory(baseDir);
    if (picked) {
      setBaseDir(normalizePickedBaseDir(picked));
    }
  }

  async function handleImportInstallation() {
    setImportingInstallation(true);
    setError(null);
    try {
      const picked = await pickDirectory(baseDir);
      if (!picked) {
        return null;
      }

      return await importInstallationFromPath(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setImportingInstallation(false);
    }
  }

  async function startInstall() {
    setLoading(true);
    setError(null);
    setResult(null);
    setInstallLogTail(null);
    setShowPostInstallHome(false);
    setWizardStep(2);
    setDashboard((current) => {
      const firstStep = installerSteps[0];
      return {
        workflowId: current?.workflowId ?? 'starting',
        phase: 'running',
        currentStep: firstStep.id,
        currentStepLabel: firstStep.title,
        progress: 0,
        completedSteps: [],
        failedStep: null,
        message: firstStep.description,
        steps: installerSteps.map((step, index) => ({
          ...step,
          state: index === 0 ? 'current' : 'pending'
        })),
        environment: current?.environment ?? [],
        installMode,
        selectedVersion,
        openclawVersion: current?.openclawVersion ?? null,
        nodeVersion: current?.nodeVersion ?? null,
        baseDir,
        systemOpenclaw: current?.systemOpenclaw ?? {
          detected: false,
          executable: null,
          version: null,
          error: null
        },
        systemNode: current?.systemNode ?? {
          detected: false,
          executable: null,
          version: null,
          satisfiesRequirement: null,
          error: null
        },
        installPlan: current?.installPlan ?? {
          targetOpenclawVersion: null,
          targetNodeVersion: null,
          action: 'install',
          requiresConfirmation: false
        }
      };
    });

    try {
      const response = await startOpenClawInstall(payload);
      setResult(response);
      await loadDashboard(payload);
      await loadInstallLog(payload.baseDir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await loadInstallLog(payload.baseDir);
    } finally {
      setLoading(false);
    }
  }

  async function handlePrimaryInstallAction(canStartInstall: boolean, requiresConfirmation: boolean) {
    if (!canStartInstall) {
      return;
    }

    if (requiresConfirmation) {
      setConfirmDialogOpen(true);
      return;
    }

    await startInstall();
  }

  async function confirmInstall() {
    setConfirmDialogOpen(false);
    await startInstall();
  }

  async function handleProviderSetup(input: OpenClawProviderSetupPayload) {
    const requestId = providerSetupRequestGuard.begin();
    setProviderSetupLoading(true);
    setError(null);
    try {
      const response = await setupOpenClawProvider(input);

      if (!providerSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      if (!providerSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (providerSetupRequestGuard.isCurrent(requestId)) {
        setProviderSetupLoading(false);
      }
    }
  }

  async function handleFeishuChannelSetup(input: OpenClawFeishuChannelSetupPayload) {
    const requestId = feishuSetupRequestGuard.begin();
    setFeishuSetupLoading(true);
    setError(null);

    try {
      const response = await setupOpenClawFeishuChannel(input);

      if (!feishuSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setFeishuSetupResult(response);
      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      if (!feishuSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (feishuSetupRequestGuard.isCurrent(requestId)) {
        setFeishuSetupLoading(false);
      }
    }
  }

  async function handleDingtalkChannelSetup(input: OpenClawDingtalkChannelSetupPayload) {
    const requestId = dingtalkSetupRequestGuard.begin();
    setDingtalkSetupLoading(true);
    setError(null);

    try {
      const response = await setupOpenClawDingtalkChannel(input);

      if (!dingtalkSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setDingtalkSetupResult(response);
      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      if (!dingtalkSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (dingtalkSetupRequestGuard.isCurrent(requestId)) {
        setDingtalkSetupLoading(false);
      }
    }
  }

  async function handleQqbotChannelSetup(input: OpenClawQqbotChannelSetupPayload) {
    const requestId = qqbotSetupRequestGuard.begin();
    setQqbotSetupLoading(true);
    setError(null);

    try {
      const response = await setupOpenClawQqbotChannel(input);

      if (!qqbotSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setQqbotSetupResult(response);
      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      if (!qqbotSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (qqbotSetupRequestGuard.isCurrent(requestId)) {
        setQqbotSetupLoading(false);
      }
    }
  }

  async function handleInstallPlugin(input: OpenClawPluginInstallPayload) {
    const requestId = pluginInstallRequestGuard.begin();
    setPluginInstallLoading(true);
    setPluginInstallResult(null);
    setError(null);
    appendPluginInstallLog('info', `开始安装插件 ${input.pluginId}。`);

    try {
      const response = await installOpenClawPlugin(input);

      if (!pluginInstallRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setPluginInstallResult(response);
      appendPluginInstallLog(
        'success',
        `插件 ${response.pluginId}@${response.version} 安装完成，已写入 ${response.pluginEntryId}。`
      );
      await finalizePostInstallMutation(response.configPath);
      return response;
    } catch (err) {
      if (!pluginInstallRequestGuard.isCurrent(requestId)) {
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      appendPluginInstallLog('error', `插件安装失败：${message}`);
      return null;
    } finally {
      if (pluginInstallRequestGuard.isCurrent(requestId)) {
        setPluginInstallLoading(false);
      }
    }
  }

  async function handleLaunchRuntime(configPath: string) {
    const requestId = runtimeLaunchRequestGuard.begin();
    setRuntimeLaunchLoading(true);
    setError(null);
    try {
      const response = await launchOpenClawRuntime(configPath);

      if (!runtimeLaunchRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setRuntimeLaunchLoading(false);
      await refreshStatusSnapshot(configPath);
      return response;
    } catch (err) {
      if (!runtimeLaunchRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (runtimeLaunchRequestGuard.isCurrent(requestId)) {
        setRuntimeLaunchLoading(false);
      }
    }
  }

  async function handleStopRuntime(configPath: string, pid?: number | null) {
    const requestId = runtimeStopRequestGuard.begin();
    setRuntimeStopLoading(true);
    setError(null);
    try {
      const response = await stopOpenClawRuntime(configPath, pid);

      if (!runtimeStopRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setRuntimeStopLoading(false);
      await refreshStatusSnapshot(configPath);

      return response;
    } catch (err) {
      if (!runtimeStopRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (runtimeStopRequestGuard.isCurrent(requestId)) {
        setRuntimeStopLoading(false);
      }
    }
  }

  async function handleRestartRuntime(configPath: string, pid?: number | null) {
    const requestId = runtimeRestartRequestGuard.begin();
    setRuntimeRestartLoading(true);
    setError(null);
    try {
      const response = await restartOpenClawRuntime(configPath, pid);

      if (!runtimeRestartRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setRuntimeRestartLoading(false);
      await refreshStatusSnapshot(configPath);
      return response;
    } catch (err) {
      if (!runtimeRestartRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (runtimeRestartRequestGuard.isCurrent(requestId)) {
        setRuntimeRestartLoading(false);
      }
    }
  }

  async function handleOpenControlPanel(configPath: string) {
    setControlPanelOpening(true);
    setError(null);
    try {
      return await openControlPanel(configPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setControlPanelOpening(false);
    }
  }

  async function handleOpenInstallationDirectory(path: string) {
    setInstallationDirOpening(true);
    setError(null);
    try {
      return await openInstallationDirectory(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setInstallationDirOpening(false);
    }
  }

  async function handleOpenLogsDirectory(configPath: string) {
    setLogsDirOpening(true);
    setError(null);
    try {
      return await openLogsDirectory(configPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLogsDirOpening(false);
    }
  }

  const handleInspectUninstallPlan = useCallback(async (installationId: string) => {
    const requestId = uninstallPlanRequestGuard.begin();
    setUninstallPlanLoading(true);
    setError(null);
    try {
      const response = await inspectUninstallPlan(installationId);
      if (!uninstallPlanRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setUninstallPlan(response);
      return response;
    } catch (err) {
      if (!uninstallPlanRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      setUninstallPlan(null);
      return null;
    } finally {
      if (uninstallPlanRequestGuard.isCurrent(requestId)) {
        setUninstallPlanLoading(false);
      }
    }
  }, [uninstallPlanRequestGuard]);

  const handleExecuteUninstall = useCallback(async (
    installationId: string,
    selectedScopes: string[],
    typedConfirmation?: string | null
  ) => {
    const requestId = uninstallExecuteRequestGuard.begin();
    setUninstallExecuting(true);
    setError(null);
    try {
      const response = await executeUninstall({
        installationId,
        selectedScopes,
        typedConfirmation
      });
      if (!uninstallExecuteRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setUninstallResult(response);
      setResult(null);
      setPostInstallStatus(null);
      setSkillCatalog(null);
      setShowPostInstallHome(false);
      return response;
    } catch (err) {
      if (!uninstallExecuteRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (uninstallExecuteRequestGuard.isCurrent(requestId)) {
        setUninstallExecuting(false);
      }
    }
  }, [uninstallExecuteRequestGuard]);

  function handleEnterPostInstallHome() {
    setShowPostInstallHome(true);
  }

  function handleBackToConfig() {
    setError(null);
    setResult(null);
    setPostInstallStatus(null);
    setFeishuSetupResult(null);
    setPluginInstallResult(null);
    setPluginInstallLogs([]);
    setSkillCatalog(null);
    setShowPostInstallHome(false);
    setLoading(false);
    setWizardStep(0);

    if (dashboard) {
      setDashboard({
        ...dashboard,
        phase: 'precheck',
        currentStep: 'loadManifest'
      });
    }
  }

  useEffect(() => {
    if (initialShowPostInstallHome) {
      setShowPostInstallHome(true);
    }
  }, [initialShowPostInstallHome]);

  useEffect(() => {
    const activeConfigPath = result?.configPath ?? initialConfigPath ?? null;
    if (!activeConfigPath || (!showPostInstallHome && !result && !initialShowPostInstallHome)) {
      return;
    }

    void loadPostInstallStatus(activeConfigPath);
    void loadSkillCatalog(activeConfigPath);
  }, [initialConfigPath, initialShowPostInstallHome, result, showPostInstallHome]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (result || showPostInstallHome) {
      return;
    }

    setWizardStep(initialWizardStep);
  }, [initialWizardStep, loading, result, showPostInstallHome]);

  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) {
      return;
    }

    const activeEl = container.querySelector('.timeline-row.active');
    if (activeEl instanceof HTMLElement) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [dashboard?.currentStep, wizardStep]);

  useEffect(() => {
    void loadVersionCatalog(installMode);
  }, [installMode]);

  useEffect(() => {
    if (loading) {
      return;
    }

    void loadDashboard(debouncedPayload);
  }, [debouncedPayload, loading]);

  useEffect(() => {
    if (result || showPostInstallHome) {
      return;
    }

    const nextWizardStep = deriveWizardStepFromDashboard(dashboard);
    if (nextWizardStep !== null) {
      setWizardStep(nextWizardStep);
    }
  }, [dashboard, result, showPostInstallHome]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const pollInstallProgress = async () => {
      if (installPollingInFlightRef.current) {
        return;
      }

      installPollingInFlightRef.current = true;
      try {
        await Promise.all([
          loadDashboard(payload),
          loadInstallLog(payload.baseDir)
        ]);
      } finally {
        installPollingInFlightRef.current = false;
      }
    };

    void pollInstallProgress();

    const timer = window.setInterval(() => {
      void pollInstallProgress();
    }, 800);

    return () => {
      window.clearInterval(timer);
      installPollingInFlightRef.current = false;
    };
  }, [loading, payload]);

  useEffect(() => {
    if (wizardStep < 2 && !loading) {
      return;
    }

    void loadInstallLog(baseDir);
  }, [baseDir, wizardStep, loading]);

  const stepProgress = dashboard?.steps ?? createPendingStepProgress();
  const completedCount = stepProgress.filter((step) => step.state === 'done').length;
  const activeStep = stepProgress.find((step) => step.state === 'current');
  const progressValue = dashboard?.progress ?? 0;
  const environmentItems = dashboard?.environment ?? [];
  const payloadSettled =
    payload.baseDir === debouncedPayload.baseDir &&
    payload.licenseKey === debouncedPayload.licenseKey &&
    payload.installMode === debouncedPayload.installMode &&
    payload.selectedVersion === debouncedPayload.selectedVersion;
  const dashboardMatchesDebouncedPayload =
    dashboard?.baseDir === debouncedPayload.baseDir &&
    dashboard?.installMode === debouncedPayload.installMode &&
    dashboard?.selectedVersion === debouncedPayload.selectedVersion;
  const dashboardReadyForCurrentPayload = payloadSettled && dashboardMatchesDebouncedPayload && !dashboardLoading;

  const step1Checks = getStepChecks(environmentItems, STEP1_CHECK_IDS);
  const step1Ready =
    dashboardReadyForCurrentPayload && step1Checks.length > 0 && step1Checks.every((check) => check.state === 'ok');

  const step2Checks = getStepChecks(environmentItems, STEP2_CHECK_IDS);
  const step2Ready =
    dashboardReadyForCurrentPayload &&
    step2Checks.length > 0 &&
    step2Checks.every((check) => check.state !== 'error');
  const selectedVersionOption = getSelectedVersionOption(versionCatalog, selectedVersion);
  const versionSelectable = selectedVersionOption?.selectable ?? false;
  const versionListReady = isVersionListReady(versionCatalog);
  const canStartInstall = step2Ready && versionListReady && versionSelectable;

  const systemOpenclaw = getSystemOpenClaw(dashboard);
  const installPlan = getInstallPlan(dashboard, selectedVersionOption);
  const installActionLabel = getInstallActionLabel(installPlan.action);
  const confirmationDescription = getConfirmationDescription(systemOpenclaw, installActionLabel);
  const confirmationTargetVersion = getConfirmationTargetVersion(installPlan, dashboard);
  const readyChecks = getReadyCheckCount(environmentItems);
  const phase = getPhase(dashboard);
  const diagnosticsInfo = buildDiagnosticsInfo({
    activeStep,
    dashboard,
    environmentItems,
    phase
  });

  const step3TimelineItems = stepProgress.slice(0, STEP3_SPLIT_INDEX);
  const step4TimelineItems = stepProgress.slice(STEP3_SPLIT_INDEX);

  return {
    activeStep,
    baseDir,
    canStartInstall,
    completedCount,
    confirmDialogOpen,
    confirmationDescription,
    confirmationTargetVersion,
    dashboard,
    dashboardLoading,
    diagnosticsInfo,
    environmentItems,
    error,
    handleBackToConfig,
    handleEnterPostInstallHome,
    handlePickDirectory,
    handlePrimaryInstallAction,
    installLogTail,
    installActionLabel,
    installMode,
    installPlan,
    installationDirOpening,
    importingInstallation,
    licenseKey,
    logsDirOpening,
    loading,
    phase,
    postInstallLoading,
    postInstallStatus,
    progressValue,
    readyChecks,
    result,
    runtimeLaunchLoading,
    runtimeStopLoading,
    runtimeRestartLoading,
    uninstallExecuting,
    uninstallPlan,
    uninstallPlanLoading,
    uninstallResult,
    skillCatalog,
    skillCatalogLoading,
    skillToggleLoadingIds,
    showPostInstallHome,
    selectedVersion,
    selectedVersionOption,
    setBaseDir,
    setConfirmDialogOpen,
    setInstallMode,
    setLicenseKey,
    setSelectedVersion,
    setWizardStep,
    step1Checks,
    step1Ready,
    step2Checks,
    step2Ready,
    step3TimelineItems,
    step4TimelineItems,
    stepProgress,
    systemOpenclaw,
    timelineContainerRef,
    providerSetupLoading,
    feishuSetupLoading,
    feishuSetupResult,
    dingtalkSetupLoading,
    dingtalkSetupResult,
    qqbotSetupLoading,
    qqbotSetupResult,
    pluginInstallLoading,
    pluginInstallResult,
    pluginInstallLogs,
    versionCatalog,
    versionCatalogLoading,
    versionListReady,
    versionSelectable,
    wizardStep,
    controlPanelOpening,
    confirmInstall,
    handleImportInstallation,
    handleLaunchRuntime,
    handleStopRuntime,
    handleRestartRuntime,
    handleOpenControlPanel,
    handleOpenInstallationDirectory,
    handleOpenLogsDirectory,
    handleInspectUninstallPlan,
    handleExecuteUninstall,
    handleInstallPlugin,
    handleFeishuChannelSetup,
    handleDingtalkChannelSetup,
    handleQqbotChannelSetup,
    handleProviderSetup,
    handleSkillToggle,
    loadSkillCatalog,
    loadPostInstallStatus
  };
}

export type OpenClawInstallerController = ReturnType<typeof useOpenClawInstaller>;

export function createInstallResultFromRecord(record: import('@/openclaw/model/types').InstallationRecord): OpenClawInstallResult {
  return {
    workflowId: record.installationId,
    installationId: record.installationId,
    status: record.status,
    openclawVersion: record.openclawVersion,
    nodeVersion: record.nodeVersion,
    openclawDir: record.openclawDir,
    nodeDir: record.nodeDir,
    configPath: record.configPath
  };
}
