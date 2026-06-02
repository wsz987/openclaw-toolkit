import type { AppBootstrapState, Stage1Phase } from './types';

export type Stage1Screen =
  | 'installed-home'
  | 'install-failed'
  | 'post-install-entry'
  | 'post-install-home'
  | 'precheck'
  | 'config'
  | 'progress-deps'
  | 'progress-verify';

export type InstallerWizardStep = 0 | 1 | 2 | 3;

type ResolveStage1ScreenInput = {
  bootstrapState?: AppBootstrapState | null;
  hasError: boolean;
  hasInstallResult: boolean;
  phase: Stage1Phase;
  showPostInstallHome: boolean;
  wizardStep: InstallerWizardStep;
};

export function hasMissingInstallationRecord(state?: AppBootstrapState | null): boolean {
  return Boolean(state?.message?.includes('安装记录丢失'));
}

export function isRecoveredInstallationState(state?: AppBootstrapState | null): boolean {
  return Boolean(
    state &&
      (state.screen === 'installedHome' || state.screen === 'recovery') &&
      state.activeInstallation
  );
}

export function getRecoveredInstallationMode(
  state?: AppBootstrapState | null
): 'installed' | 'recovery' {
  return state?.screen === 'recovery' ? 'recovery' : 'installed';
}

export function resolveStage1Screen({
  bootstrapState,
  hasError,
  hasInstallResult,
  phase,
  showPostInstallHome,
  wizardStep
}: ResolveStage1ScreenInput): Stage1Screen {
  if (isRecoveredInstallationState(bootstrapState)) {
    return 'installed-home';
  }

  if (hasError || phase === 'failed') {
    return 'install-failed';
  }

  if (phase === 'succeeded' && hasInstallResult) {
    return showPostInstallHome ? 'post-install-home' : 'post-install-entry';
  }

  if (wizardStep === 0) {
    return 'precheck';
  }

  if (wizardStep === 1) {
    return 'config';
  }

  if (wizardStep === 2) {
    return 'progress-deps';
  }

  return 'progress-verify';
}

export function shouldShowInstallerChrome(screen: Stage1Screen): boolean {
  return (
    screen === 'precheck' ||
    screen === 'config' ||
    screen === 'progress-deps' ||
    screen === 'progress-verify'
  );
}
