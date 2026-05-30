import { useEffect, useMemo, useRef, useState } from 'react';
import { STEP1_CHECK_IDS, STEP2_CHECK_IDS, STEP3_SPLIT_INDEX } from '../model/graph';
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
  Stage1InstallPayload,
  Stage1InstallResult,
  VersionCatalogResult
} from '../model/types';
import {
  inspectOpenClawStatus,
  inspectStage1Dashboard,
  inspectVersionCatalog,
  launchOpenClawRuntime,
  pickDirectory,
  setupOpenClawProvider,
  startStage1Install
} from '../api/stage1-api';

export function useStage1Installer() {
  const DASHBOARD_DEBOUNCE_MS = 350;

  const [baseDir, setBaseDir] = useState('D:\\OpenClaw');
  const [licenseKey, setLicenseKey] = useState('stage1-dev');
  const [installMode, setInstallMode] = useState<InstallMode>('local');
  const [selectedVersion, setSelectedVersion] = useState('latest');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<Stage1Dashboard | null>(null);
  const [versionCatalogLoading, setVersionCatalogLoading] = useState(false);
  const [versionCatalog, setVersionCatalog] = useState<VersionCatalogResult | null>(null);
  const [result, setResult] = useState<Stage1InstallResult | null>(null);
  const [postInstallStatus, setPostInstallStatus] = useState<OpenClawPostInstallStatus | null>(null);
  const [postInstallLoading, setPostInstallLoading] = useState(false);
  const [providerSetupLoading, setProviderSetupLoading] = useState(false);
  const [providerSetupResult, setProviderSetupResult] = useState<OpenClawProviderSetupResult | null>(null);
  const [runtimeLaunchLoading, setRuntimeLaunchLoading] = useState(false);
  const [runtimeLaunchResult, setRuntimeLaunchResult] = useState<OpenClawLaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const dashboardRequestIdRef = useRef(0);
  const dashboardDebounceTimerRef = useRef<number | null>(null);

  const payload = useMemo<Stage1InstallPayload>(
    () => ({
      baseDir,
      licenseKey,
      installMode,
      selectedVersion
    }),
    [baseDir, licenseKey, installMode, selectedVersion]
  );

  async function loadVersionCatalog(mode: InstallMode, preserveSelection = true) {
    setVersionCatalogLoading(true);
    try {
      const response = await inspectVersionCatalog(mode);
      setVersionCatalog(response);
      setSelectedVersion((current) => {
        if (!preserveSelection) {
          return response.defaultValue;
        }

        const currentOption = response.options.find((option) => option.value === current);
        return currentOption?.selectable ? current : response.defaultValue;
      });
    } catch (err) {
      setVersionCatalog({
        installMode: mode,
        sourceReady: false,
        defaultValue: 'latest',
        latestVersion: null,
        options: [],
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setVersionCatalogLoading(false);
    }
  }

  async function loadDashboard(input: Stage1InstallPayload) {
    const requestId = ++dashboardRequestIdRef.current;
    setError(null);
    setDashboardLoading(true);

    try {
      const response = await inspectStage1Dashboard(input);

      if (requestId !== dashboardRequestIdRef.current) {
        return;
      }

      setDashboard(response);
    } catch (err) {
      if (requestId !== dashboardRequestIdRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setDashboardLoading(false);
      }
    }
  }

  async function handlePickDirectory() {
    const picked = await pickDirectory(baseDir);
    if (picked) {
      setBaseDir(picked);
    }
  }

  async function startInstall() {
    setLoading(true);
    setError(null);
    setResult(null);
    setPostInstallStatus(null);
    setProviderSetupResult(null);
    setRuntimeLaunchResult(null);
    setWizardStep(2);

    try {
      const response = await startStage1Install(payload);
      setResult(response);
      await loadPostInstallStatus(response.configPath);
      await loadDashboard(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    setPostInstallLoading(true);
    try {
      const response = await inspectOpenClawStatus(configPath);
      setPostInstallStatus(response);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setPostInstallLoading(false);
    }
  }

  async function handleProviderSetup(input: OpenClawProviderSetupPayload) {
    setProviderSetupLoading(true);
    setError(null);
    try {
      const response = await setupOpenClawProvider(input);
      setProviderSetupResult(response);
      await loadPostInstallStatus(response.configPath);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setProviderSetupLoading(false);
    }
  }

  async function handleLaunchRuntime(configPath: string) {
    setRuntimeLaunchLoading(true);
    setError(null);
    try {
      const response = await launchOpenClawRuntime(configPath);
      setRuntimeLaunchResult(response);
      await loadPostInstallStatus(configPath);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setRuntimeLaunchLoading(false);
    }
  }

  function handleBackToConfig() {
    setError(null);
    setResult(null);
    setPostInstallStatus(null);
    setProviderSetupResult(null);
    setRuntimeLaunchResult(null);
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

    if (dashboardDebounceTimerRef.current !== null) {
      window.clearTimeout(dashboardDebounceTimerRef.current);
    }

    const nextPayload = payload;
    dashboardDebounceTimerRef.current = window.setTimeout(() => {
      dashboardDebounceTimerRef.current = null;
      void loadDashboard(nextPayload);
    }, DASHBOARD_DEBOUNCE_MS);

    return () => {
      if (dashboardDebounceTimerRef.current !== null) {
        window.clearTimeout(dashboardDebounceTimerRef.current);
        dashboardDebounceTimerRef.current = null;
      }
    };
  }, [payload]);

  useEffect(() => {
    const nextWizardStep = deriveWizardStepFromDashboard(dashboard);
    if (nextWizardStep !== null) {
      setWizardStep(nextWizardStep);
    }
  }, [dashboard]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDashboard(payload);
    }, 800);

    return () => window.clearInterval(timer);
  }, [loading, payload]);

  const stepProgress = dashboard?.steps ?? createPendingStepProgress();
  const completedCount = stepProgress.filter((step) => step.state === 'done').length;
  const activeStep = stepProgress.find((step) => step.state === 'current');
  const progressValue = dashboard?.progress ?? 0;
  const environmentItems = dashboard?.environment ?? [];

  const step1Checks = getStepChecks(environmentItems, STEP1_CHECK_IDS);
  const step1Ready = step1Checks.length > 0 && step1Checks.every((check) => check.state === 'ok');

  const step2Checks = getStepChecks(environmentItems, STEP2_CHECK_IDS);
  const step2Ready = step2Checks.length > 0 && step2Checks.every((check) => check.state !== 'error');
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
    handlePickDirectory,
    handlePrimaryInstallAction,
    installActionLabel,
    installMode,
    installPlan,
    licenseKey,
    loading,
    phase,
    postInstallLoading,
    postInstallStatus,
    progressValue,
    readyChecks,
    result,
    runtimeLaunchLoading,
    runtimeLaunchResult,
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
    confirmInstall,
    handleLaunchRuntime,
    handleProviderSetup,
    loadPostInstallStatus
  };
}
