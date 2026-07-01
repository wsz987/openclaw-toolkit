import { PostInstallEntryView } from './components/post-install-entry-view';
import { InstallerWorkflowScreen } from './components/installer-workflow-screen';
import { InstallerWorkflowView } from './components/installer-workflow-view';
import { PostInstallHomeScreen } from './components/post-install-home-screen';
import {
  isInstallerWorkflowScreen,
  isPostInstallScreen,
  isRecoveredInstallationState,
  resolveInstallerScreen
} from './model/app-flow';
import { useOpenClawInstaller } from './hooks/use-stage1-installer';
import type { AppBootstrapState } from './model/types';

type OpenClawInstallerAppProps = {
  bootstrapState?: AppBootstrapState | null;
  onExitInstalledHome?: () => void;
  initialBaseDir?: string | null;
  initialWizardStep?: 0 | 1 | 2 | 3;
};

export function OpenClawInstallerApp({
  bootstrapState,
  onExitInstalledHome,
  initialBaseDir,
  initialWizardStep
}: OpenClawInstallerAppProps) {
  const shouldOpenInstalledHomeDirectly = isRecoveredInstallationState(bootstrapState);

  const controller = useOpenClawInstaller(
    initialBaseDir ??
      bootstrapState?.settings.lastSelectedBaseDir ??
      bootstrapState?.activeInstallation?.baseDir ??
      bootstrapState?.defaultBaseDir ??
      null,
    bootstrapState?.activeInstallation?.configPath ?? null,
    shouldOpenInstalledHomeDirectly,
    initialWizardStep
  );

  const screen = resolveInstallerScreen({
    bootstrapState,
    hasError: Boolean(controller.error),
    hasInstallResult: Boolean(controller.result),
    phase: controller.phase,
    showPostInstallHome: controller.showPostInstallHome,
    wizardStep: controller.wizardStep
  });

  if (isPostInstallScreen(screen)) {
    return (
      <PostInstallHomeScreen
        bootstrapState={bootstrapState}
        controller={controller}
        onExitInstalledHome={onExitInstalledHome}
      />
    );
  }

  if (screen === 'post-install-entry' && controller.result) {
    return (
      <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
        <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
          <PostInstallEntryView
            result={controller.result}
            onContinue={controller.handleEnterPostInstallHome}
            onBack={controller.handleBackToConfig}
          />
        </div>
      </main>
    );
  }

  if (screen === 'install-failed') {
    return (
      <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
        <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
          <InstallerWorkflowView controller={controller} screen={screen} />
        </div>
      </main>
    );
  }

  if (isInstallerWorkflowScreen(screen)) {
    return <InstallerWorkflowScreen controller={controller} screen={screen} />;
  }

  return null;
}

export const Stage1InstallerApp = OpenClawInstallerApp;
