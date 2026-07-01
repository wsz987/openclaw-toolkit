import { PostInstallEntryView } from './components/post-install-entry-view';
import { InstallerWorkflowScreen } from './components/installer-workflow-screen';
import { InstallerWorkflowView } from './components/installer-workflow-view';
import { DashboardApp } from '../dashboard/dashboard-app';
import {
  isInstallerWorkflowScreen,
  isPostInstallScreen,
  resolveInstallerScreen
} from './model/app-flow';
import { useOpenClawInstaller } from './hooks/use-openclaw-installer';
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
  const controller = useOpenClawInstaller(
    initialBaseDir ??
      bootstrapState?.settings.lastSelectedBaseDir ??
      bootstrapState?.activeInstallation?.baseDir ??
      bootstrapState?.defaultBaseDir ??
      null,
    bootstrapState?.activeInstallation?.configPath ?? null,
    false,
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

  // 安装完成进入"安装后首页"阶段：交由 Dashboard feature 接管，
  // 传入当前控制器以保留安装结果（result），避免重新拉取状态的竞态。
  if (isPostInstallScreen(screen) || controller.showPostInstallHome) {
    return (
      <DashboardApp
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
