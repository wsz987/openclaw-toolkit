import { STEP3_SPLIT_INDEX, installerSteps, stepDiagnosticsMap } from './graph';
import type { InstallerWizardStep } from './app-flow';
import type {
  InstallCheckState,
  InstallDashboard,
  InstallDiagnosticsInfo,
  InstallEnvironmentCheck,
  InstallPhase,
  InstallStep,
  InstallStepSnapshot,
  VersionCatalogOption,
  VersionCatalogResult
} from './types';

export function createPendingStepProgress(): InstallStepSnapshot[] {
  return installerSteps.map((step) => ({
    ...step,
    state: 'pending'
  }));
}

export function getStepChecks(environmentItems: InstallEnvironmentCheck[], ids: string[]) {
  return environmentItems.filter((check) => ids.includes(check.id));
}

export function getSelectedVersionOption(
  versionCatalog: VersionCatalogResult | null,
  selectedVersion: string
): VersionCatalogOption | null {
  return versionCatalog?.options.find((option) => option.value === selectedVersion) ?? null;
}

export function isVersionListReady(versionCatalog: VersionCatalogResult | null) {
  return Boolean(versionCatalog?.sourceReady && versionCatalog.options.length > 0);
}

export function getSystemOpenClaw(dashboard: InstallDashboard | null): InstallDashboard['systemOpenclaw'] {
  return dashboard?.systemOpenclaw ?? {
    detected: false,
    executable: null,
    version: null,
    error: null
  };
}

export function getInstallPlan(
  dashboard: InstallDashboard | null,
  selectedVersionOption: VersionCatalogOption | null
): InstallDashboard['installPlan'] {
  return dashboard?.installPlan ?? {
    targetOpenclawVersion: selectedVersionOption?.actualVersion ?? dashboard?.openclawVersion ?? null,
    targetNodeVersion: dashboard?.nodeVersion ?? null,
    action: 'install',
    requiresConfirmation: false
  };
}

export function getInstallActionLabel(action: string) {
  if (action === 'upgrade') {
    return '升级';
  }

  if (action === 'reinstall') {
    return '重装';
  }

  return '安装';
}

export function getConfirmationDescription(
  systemOpenclaw: InstallDashboard['systemOpenclaw'],
  installActionLabel: string
) {
  return '检测到您系统已安装 OpenClaw。为避免运行冲突，本工具将为您部署在完全隔离的专属受管目录中。';
}

export function getConfirmationTargetVersion(
  installPlan: InstallDashboard['installPlan'],
  dashboard: InstallDashboard | null
) {
  return installPlan.targetOpenclawVersion ?? dashboard?.openclawVersion ?? '待解析';
}

export function getReadyCheckCount(environmentItems: InstallEnvironmentCheck[]) {
  return environmentItems.filter((item) => item.state === 'ok').length;
}

export function getPhase(dashboard: InstallDashboard | null): InstallPhase {
  return dashboard?.phase ?? 'precheck';
}

export function buildDiagnosticsInfo(params: {
  activeStep: InstallStepSnapshot | undefined;
  dashboard: InstallDashboard | null;
  environmentItems: InstallEnvironmentCheck[];
  phase: InstallPhase;
}): InstallDiagnosticsInfo | null {
  const { activeStep, dashboard, environmentItems, phase } = params;
  const stepId = activeStep?.id || dashboard?.currentStep || dashboard?.failedStep || 'loadManifest';
  const diag = stepDiagnosticsMap[stepId];

  if (!diag) {
    return null;
  }

  const envCheckStates = new Map<string, InstallCheckState>();
  environmentItems.forEach((item) => {
    envCheckStates.set(item.id, item.state);
  });

  return {
    ...diag,
    tasks: diag.tasks.map((task) => {
      let status: 'checked' | 'pending' | 'waiting' = 'waiting';

      const isStepDone = dashboard?.completedSteps.includes(stepId);
      const isStepCurrent = dashboard?.currentStep === stepId;

      if (isStepDone || phase === 'succeeded') {
        status = 'checked';
      } else if (isStepCurrent) {
        status = envCheckStates.get(task.key) === 'ok' ? 'checked' : 'pending';
      }

      return { ...task, status };
    })
  };
}

export function deriveWizardStepFromDashboard(
  dashboard: InstallDashboard | null
): InstallerWizardStep | null {
  if (!dashboard) {
    return null;
  }

  if (dashboard.phase === 'succeeded') {
    return 3;
  }

  if (dashboard.phase === 'running') {
    return getWizardStepForInstallStep(dashboard.currentStep);
  }

  if (dashboard.phase === 'failed') {
    return getWizardStepForInstallStep(dashboard.failedStep);
  }

  return null;
}

export function getWizardStepForInstallStep(
  step: InstallStep | null
): InstallerWizardStep | null {
  if (!step) {
    return null;
  }

  const stepIndex = installerSteps.findIndex((item) => item.id === step);
  return (stepIndex >= STEP3_SPLIT_INDEX ? 3 : 2) as InstallerWizardStep;
}

export function findStepTitle(step: InstallStep | null | undefined) {
  return step ? installerSteps.find((item) => item.id === step)?.title : undefined;
}
