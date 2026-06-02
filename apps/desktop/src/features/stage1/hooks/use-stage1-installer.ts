import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/use-debounced-value';
import { useLatestRequestGuard } from '../../../hooks/use-latest-request-guard';
import { STEP1_CHECK_IDS, STEP2_CHECK_IDS, STEP3_SPLIT_INDEX } from '../model/graph';
import {
  stage1Steps,
  isInstallStep,
} from '../model/graph';
import type { InstallerWizardStep } from '../model/app-flow';
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
} from '../model/selectors';
import type {
  InstallMode,
  OpenClawLaunchResult,
  OpenClawPostInstallStatus,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  Stage1Dashboard,
  Stage1InstallLogTail,
  Stage1InstallPayload,
  Stage1InstallResult,
  VersionCatalogResult
} from '../model/types';
import {
  importInstallationFromPath,
  inspectOpenClawStatus,
  inspectStage1Dashboard,
  inspectVersionCatalog,
  launchOpenClawRuntime,
  openControlPanel,
  openInstallationDirectory,
  openLogsDirectory,
  pickDirectory,
  readStage1InstallLogTail,
  setupOpenClawProvider,
  startStage1Install
} from '../api/stage1-api';

export function useStage1Installer(
  initialBaseDir?: string | null,
  initialShowPostInstallHome = false,
  initialWizardStep: InstallerWizardStep = 0
) {
  const DASHBOARD_DEBOUNCE_MS = 350;

  const [baseDir, setBaseDir] = useState(initialBaseDir && initialBaseDir.trim().length > 0 ? initialBaseDir : 'D:\\OpenClaw');
  const [licenseKey, setLicenseKey] = useState('stage1-dev');
  const [installMode, setInstallMode] = useState<InstallMode>('local');
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<Stage1Dashboard | null>(null);
  const [versionCatalogLoading, setVersionCatalogLoading] = useState(false);
  const [versionCatalog, setVersionCatalog] = useState<VersionCatalogResult | null>(null);
  const [result, setResult] = useState<Stage1InstallResult | null>(null);
  const [installLogTail, setInstallLogTail] = useState<Stage1InstallLogTail | null>(null);
  const [postInstallStatus, setPostInstallStatus] = useState<OpenClawPostInstallStatus | null>(null);
  const [postInstallLoading, setPostInstallLoading] = useState(false);
  const [providerSetupLoading, setProviderSetupLoading] = useState(false);
  const [providerSetupResult, setProviderSetupResult] = useState<OpenClawProviderSetupResult | null>(null);
  const [runtimeLaunchLoading, setRuntimeLaunchLoading] = useState(false);
  const [runtimeLaunchResult, setRuntimeLaunchResult] = useState<OpenClawLaunchResult | null>(null);
  const [controlPanelOpening, setControlPanelOpening] = useState(false);
  const [installationDirOpening, setInstallationDirOpening] = useState(false);
  const [logsDirOpening, setLogsDirOpening] = useState(false);
  const [importingInstallation, setImportingInstallation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<InstallerWizardStep>(initialWizardStep);
  const [showPostInstallHome, setShowPostInstallHome] = useState(initialShowPostInstallHome);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const dashboardRequestGuard = useLatestRequestGuard();
  const versionCatalogRequestGuard = useLatestRequestGuard();
  const postInstallStatusRequestGuard = useLatestRequestGuard();
  const providerSetupRequestGuard = useLatestRequestGuard();
  const runtimeLaunchRequestGuard = useLatestRequestGuard();
  const installLogRequestGuard = useLatestRequestGuard();

  const payload = useMemo<Stage1InstallPayload>(
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

  async function loadDashboard(input: Stage1InstallPayload) {
    const requestId = dashboardRequestGuard.begin();
    setError(null);
    setDashboardLoading(true);

    try {
      const response = await inspectStage1Dashboard(input);

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
      const response = await readStage1InstallLogTail(baseDirToRead, 200);
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

  async function handlePickDirectory() {
    const picked = await pickDirectory(baseDir);
    if (picked) {
      setBaseDir(picked);
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
    setPostInstallStatus(null);
    setProviderSetupResult(null);
    setRuntimeLaunchResult(null);
    setShowPostInstallHome(false);
    setWizardStep(2);
    setDashboard((current) => {
      const firstStep = stage1Steps[0];
      return {
        workflowId: current?.workflowId ?? 'starting',
        phase: 'running',
        currentStep: firstStep.id,
        currentStepLabel: firstStep.title,
        progress: 0,
        completedSteps: [],
        failedStep: null,
        message: firstStep.description,
        steps: stage1Steps.map((step, index) => ({
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
      const response = await startStage1Install(payload);
      setResult(response);
      await loadPostInstallStatus(response.configPath);
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

  async function loadPostInstallStatus(configPath: string) {
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

  async function handleProviderSetup(input: OpenClawProviderSetupPayload) {
    const requestId = providerSetupRequestGuard.begin();
    setProviderSetupLoading(true);
    setError(null);
    try {
      const response = await setupOpenClawProvider(input);

      if (!providerSetupRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setProviderSetupResult(response);
      await loadPostInstallStatus(response.configPath);
      handleEnterPostInstallHome();
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

  async function handleLaunchRuntime(configPath: string) {
    const requestId = runtimeLaunchRequestGuard.begin();
    setRuntimeLaunchLoading(true);
    setError(null);
    try {
      const response = await launchOpenClawRuntime(configPath);

      if (!runtimeLaunchRequestGuard.isCurrent(requestId)) {
        return null;
      }

      setRuntimeLaunchResult(response);
      await loadPostInstallStatus(configPath);
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

  function handleEnterPostInstallHome() {
    setShowPostInstallHome(true);
  }

  function handleBackToConfig() {
    setError(null);
    setResult(null);
    setPostInstallStatus(null);
    setProviderSetupResult(null);
    setRuntimeLaunchResult(null);
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

    const timer = window.setInterval(() => {
      void loadDashboard(payload);
      void loadInstallLog(payload.baseDir);
    }, 800);

    return () => window.clearInterval(timer);
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
    runtimeLaunchResult,
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
    providerSetupResult,
    versionCatalog,
    versionCatalogLoading,
    versionListReady,
    versionSelectable,
    wizardStep,
    controlPanelOpening,
    confirmInstall,
    handleImportInstallation,
    handleLaunchRuntime,
    handleOpenControlPanel,
    handleOpenInstallationDirectory,
    handleOpenLogsDirectory,
    handleProviderSetup,
    loadPostInstallStatus
  };
}

export function createInstallResultFromRecord(record: import('../model/types').InstallationRecord): Stage1InstallResult {
  return {
    workflowId: record.installationId,
    status: record.status,
    openclawVersion: record.openclawVersion,
    nodeVersion: record.nodeVersion,
    openclawDir: record.openclawDir,
    nodeDir: record.nodeDir,
    configPath: record.configPath
  };
}
