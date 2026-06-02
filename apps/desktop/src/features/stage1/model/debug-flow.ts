import type { AppBootstrapState } from './types';
import type { InstallerWizardStep } from './app-flow';

export type DebugBootstrapMode = 'auto' | 'installer' | 'installed-home';

export type Stage1DebugFlowState = {
  mode: DebugBootstrapMode;
  installerStep: InstallerWizardStep;
};

const DEBUG_FLOW_STORAGE_KEY = 'stage1-debug-flow';

const DEFAULT_DEBUG_FLOW_STATE: Stage1DebugFlowState = {
  mode: 'auto',
  installerStep: 0
};

function isInstallerWizardStep(value: unknown): value is InstallerWizardStep {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

function isDebugBootstrapMode(value: unknown): value is DebugBootstrapMode {
  return value === 'auto' || value === 'installer' || value === 'installed-home';
}

export function readStage1DebugFlowState(): Stage1DebugFlowState {
  if (typeof window === 'undefined') {
    return DEFAULT_DEBUG_FLOW_STATE;
  }

  try {
    const raw = window.localStorage.getItem(DEBUG_FLOW_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DEBUG_FLOW_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<Stage1DebugFlowState>;
    return {
      mode: isDebugBootstrapMode(parsed.mode) ? parsed.mode : DEFAULT_DEBUG_FLOW_STATE.mode,
      installerStep: isInstallerWizardStep(parsed.installerStep)
        ? parsed.installerStep
        : DEFAULT_DEBUG_FLOW_STATE.installerStep
    };
  } catch {
    return DEFAULT_DEBUG_FLOW_STATE;
  }
}

export function writeStage1DebugFlowState(state: Stage1DebugFlowState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEBUG_FLOW_STORAGE_KEY, JSON.stringify(state));
}

export function getEffectiveBootstrapState(
  state: AppBootstrapState | null,
  mode: DebugBootstrapMode
): AppBootstrapState | null {
  if (!state) {
    return null;
  }

  if (mode === 'installer') {
    return null;
  }

  if (mode === 'installed-home' && state.activeInstallation) {
    return {
      ...state,
      screen: 'installedHome'
    };
  }

  return state;
}

export function canForceInstalledHome(state: AppBootstrapState | null): boolean {
  return Boolean(state?.activeInstallation);
}
