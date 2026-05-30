import { invoke } from '@tauri-apps/api/core';
import { isInstallStep } from '../model/graph';
import type {
  DirectoryPickerResponse,
  InstallMode,
  Stage1CheckState,
  Stage1Dashboard,
  Stage1InstallPayload,
  Stage1InstallResult,
  Stage1StepState,
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

export async function inspectStage1Dashboard(input: Stage1InstallPayload): Promise<Stage1Dashboard> {
  const response = await invoke<Stage1Dashboard>('inspect_stage1_dashboard_command', { input });
  return normalizeDashboard(response);
}

export async function startStage1Install(input: Stage1InstallPayload): Promise<Stage1InstallResult> {
  return invoke<Stage1InstallResult>('start_stage1_install', { input });
}

export async function pickDirectory(defaultPath: string): Promise<DirectoryPickerResponse> {
  return invoke<DirectoryPickerResponse>('pick_directory_dialog', {
    request: {
      title: '选择 OpenClaw 安装目录',
      defaultPath
    }
  });
}
