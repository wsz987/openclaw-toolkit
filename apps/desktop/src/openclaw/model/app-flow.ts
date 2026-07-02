import type { AppBootstrapState, InstallPhase } from './types';

export type InstallerScreen =
  | 'installed-home'
  | 'install-failed'
  | 'post-install-entry'
  | 'post-install-home'
  | 'precheck'
  | 'config'
  | 'progress-deps'
  | 'progress-verify';

export type InstallerWizardStep = 0 | 1 | 2 | 3;
export type InstallerWorkflowScreen = Extract<
  InstallerScreen,
  'precheck' | 'config' | 'progress-deps' | 'progress-verify'
>;
export type PostInstallScreen = Extract<InstallerScreen, 'installed-home' | 'post-install-home'>;

export type ResolveInstallerScreenInput = {
  bootstrapState?: AppBootstrapState | null;
  hasError: boolean;
  hasInstallResult: boolean;
  phase: InstallPhase;
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

export function resolveInstallerScreen({
  bootstrapState,
  hasError,
  hasInstallResult,
  phase,
  showPostInstallHome,
  wizardStep
}: ResolveInstallerScreenInput): InstallerScreen {
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

export function shouldShowInstallerChrome(screen: InstallerScreen): boolean {
  return isInstallerWorkflowScreen(screen);
}

export function isInstallerWorkflowScreen(
  screen: InstallerScreen
): screen is InstallerWorkflowScreen {
  return (
    screen === 'precheck' ||
    screen === 'config' ||
    screen === 'progress-deps' ||
    screen === 'progress-verify'
  );
}

export function isPostInstallScreen(screen: InstallerScreen): screen is PostInstallScreen {
  return screen === 'installed-home' || screen === 'post-install-home';
}
