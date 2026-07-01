import { ConfirmInstallDialog } from './confirm-install-dialog';
import { Stage1Header } from './stage1-header';
import { Stage1Shell } from './stage1-shell';
import { Stage1Stepper } from './stage1-stepper';
import { InstallerWorkflowView } from './installer-workflow-view';
import type { InstallerWorkflowScreen } from '../model/app-flow';
import type { OpenClawInstallerController } from '../hooks/use-stage1-installer';

type InstallerWorkflowScreenProps = {
  controller: OpenClawInstallerController;
  screen: InstallerWorkflowScreen;
};

export function InstallerWorkflowScreen({
  controller,
  screen
}: InstallerWorkflowScreenProps) {
  return (
    <>
      <Stage1Shell
        sidebar={
          <>
            <Stage1Header
              openclawVersion={controller.dashboard?.openclawVersion}
              nodeVersion={controller.dashboard?.nodeVersion}
              layout="vertical"
            />
            <Stage1Stepper
              phase={controller.phase}
              wizardStep={controller.wizardStep}
              onStepSelect={controller.setWizardStep}
              layout="vertical"
            />
          </>
        }
        footer={
          <div className="text-[10px] text-[hsl(var(--muted-soft))] font-medium flex items-center justify-between">
            <span>OpenClaw Core</span>
            <span>v{controller.dashboard?.openclawVersion || '1.0.0'}</span>
          </div>
        }
        content={<InstallerWorkflowView controller={controller} screen={screen} />}
        contentClassName="overflow-y-auto"
      />

      <ConfirmInstallDialog
        open={controller.confirmDialogOpen}
        onOpenChange={controller.setConfirmDialogOpen}
        loading={controller.loading}
        confirmationDescription={controller.confirmationDescription}
        systemOpenclaw={controller.systemOpenclaw}
        confirmationTargetVersion={controller.confirmationTargetVersion}
        installPlan={controller.installPlan}
        installActionLabel={controller.installActionLabel}
        onConfirm={() => void controller.confirmInstall()}
      />
    </>
  );
}
