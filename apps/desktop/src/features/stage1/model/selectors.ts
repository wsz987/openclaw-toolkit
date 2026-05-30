import { STEP3_SPLIT_INDEX, stage1Steps, stepDiagnosticsMap } from './graph';
import type {
  InstallStep,
  Stage1CheckState,
  Stage1Dashboard,
  Stage1DiagnosticsInfo,
  Stage1EnvironmentCheck,
  Stage1Phase,
  Stage1StepSnapshot,
  VersionCatalogOption,
  VersionCatalogResult
} from './types';

export function createPendingStepProgress(): Stage1StepSnapshot[] {
  return stage1Steps.map((step) => ({
    ...step,
    state: 'pending'
  }));
}

export function getStepChecks(environmentItems: Stage1EnvironmentCheck[], ids: string[]) {
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

export function getSystemOpenClaw(dashboard: Stage1Dashboard | null): Stage1Dashboard['systemOpenclaw'] {
  return dashboard?.systemOpenclaw ?? {
    detected: false,
    executable: null,
    version: null,
    error: null
  };
}

export function getInstallPlan(
  dashboard: Stage1Dashboard | null,
  selectedVersionOption: VersionCatalogOption | null
): Stage1Dashboard['installPlan'] {
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
  systemOpenclaw: Stage1Dashboard['systemOpenclaw'],
  installActionLabel: string
) {
  if (systemOpenclaw.version) {
    return `当前电脑已存在 OpenClaw ${systemOpenclaw.version}，继续后将按官方安装规范在受管运行环境中执行${installActionLabel}。`;
  }

  return '当前电脑已存在系统级 OpenClaw，但未成功读取版本信息。继续后仍会按官方安装规范在受管运行环境中执行安装或更新。';
}

export function getConfirmationTargetVersion(
  installPlan: Stage1Dashboard['installPlan'],
  dashboard: Stage1Dashboard | null
) {
  return installPlan.targetOpenclawVersion ?? dashboard?.openclawVersion ?? '待解析';
}

export function getReadyCheckCount(environmentItems: Stage1EnvironmentCheck[]) {
  return environmentItems.filter((item) => item.state === 'ok').length;
}

export function getPhase(dashboard: Stage1Dashboard | null): Stage1Phase {
  return dashboard?.phase ?? 'precheck';
}

export function buildDiagnosticsInfo(params: {
  activeStep: Stage1StepSnapshot | undefined;
  dashboard: Stage1Dashboard | null;
  environmentItems: Stage1EnvironmentCheck[];
  phase: Stage1Phase;
}): Stage1DiagnosticsInfo | null {
  const { activeStep, dashboard, environmentItems, phase } = params;
  const stepId = activeStep?.id || dashboard?.currentStep || dashboard?.failedStep || 'loadManifest';
  const diag = stepDiagnosticsMap[stepId];

  if (!diag) {
    return null;
  }

  const envCheckStates = new Map<string, Stage1CheckState>();
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

export function deriveWizardStepFromDashboard(dashboard: Stage1Dashboard | null): number | null {
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

export function getWizardStepForInstallStep(step: InstallStep | null) {
  if (!step) {
    return null;
  }

  const stepIndex = stage1Steps.findIndex((item) => item.id === step);
  return stepIndex >= STEP3_SPLIT_INDEX ? 3 : 2;
}

export function findStepTitle(step: InstallStep | null | undefined) {
  return step ? stage1Steps.find((item) => item.id === step)?.title : undefined;
}
