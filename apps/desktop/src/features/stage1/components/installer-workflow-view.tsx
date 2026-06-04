import { findStepTitle } from '../model/selectors';
import type { InstallerWorkflowScreen } from '../model/app-flow';
import type { Stage1InstallerController } from '../hooks/use-stage1-installer';
import { ConfigStepView, ErrorStateView, PrecheckStepView, ProgressStageView } from './stage1-views';

type InstallerWorkflowViewProps = {
  controller: Stage1InstallerController;
  screen: InstallerWorkflowScreen | 'install-failed';
};

export function InstallerWorkflowView({ controller, screen }: InstallerWorkflowViewProps) {
  const {
    baseDir,
    canStartInstall,
    completedCount,
    dashboard,
    dashboardLoading,
    diagnosticsInfo,
    error,
    handleBackToConfig,
    handlePickDirectory,
    handlePrimaryInstallAction,
    installActionLabel,
    installLogTail,
    installMode,
    installPlan,
    licenseKey,
    loading,
    progressValue,
    selectedVersion,
    selectedVersionOption,
    setBaseDir,
    setInstallMode,
    setLicenseKey,
    setSelectedVersion,
    setWizardStep,
    step1Checks,
    step1Ready,
    step2Checks,
    step3TimelineItems,
    step4TimelineItems,
    systemOpenclaw,
    timelineContainerRef,
    versionCatalog,
    versionCatalogLoading
  } = controller;

  if (screen === 'install-failed') {
    return (
      <ErrorStateView
        errorMessage={error || dashboard?.message || '安装过程中发生未预期的异常错误。'}
        failedStepLabel={findStepTitle(dashboard?.failedStep) ?? '执行单元'}
        onBack={handleBackToConfig}
      />
    );
  }

  if (screen === 'precheck') {
    return (
      <PrecheckStepView
        baseDir={baseDir}
        step1Checks={step1Checks}
        step1Ready={step1Ready}
        dashboardLoading={dashboardLoading}
        onBaseDirChange={setBaseDir}
        onPickDirectory={() => void handlePickDirectory()}
        onNext={() => setWizardStep(1)}
      />
    );
  }

  if (screen === 'config') {
    return (
      <ConfigStepView
        licenseKey={licenseKey}
        installMode={installMode}
        selectedVersion={selectedVersion}
        versionCatalogLoading={versionCatalogLoading}
        versionCatalog={versionCatalog}
        selectedVersionOption={selectedVersionOption}
        systemOpenclaw={systemOpenclaw}
        installActionLabel={installActionLabel}
        confirmationTargetVersion={controller.confirmationTargetVersion}
        loading={loading}
        canStartInstall={canStartInstall}
        step2Checks={step2Checks}
        onLicenseKeyChange={setLicenseKey}
        onInstallModeChange={setInstallMode}
        onSelectedVersionChange={setSelectedVersion}
        onBack={() => setWizardStep(0)}
        onInstall={() => void handlePrimaryInstallAction(canStartInstall, installPlan.requiresConfirmation)}
      />
    );
  }

  if (screen === 'progress-deps') {
    return (
      <ProgressStageView
        title="步骤 3: 运行环境依赖部署"
        subtitle="正在安装 Node 及 OpenClaw 核心制品..."
        statusMessage={dashboard?.message}
        timelineDescription="步骤 1-9: 基础环境与依赖写入"
        progressValue={progressValue}
        currentStepLabel={dashboard?.currentStepLabel ?? '核心安装进行中...'}
        completedCount={completedCount}
        timelineItems={step3TimelineItems}
        installLogTail={installLogTail}
        diagnosticsInfo={diagnosticsInfo}
        timelineContainerRef={timelineContainerRef}
      />
    );
  }

  return (
    <ProgressStageView
      title="步骤 4: 写入配置与服务验证"
      subtitle="写入 openclaw.json 系统配置及 Skills 数据，开启首次冷启动联调校验..."
      statusMessage={dashboard?.message}
      timelineDescription="步骤 10-15: 系统配置写入及启动校验"
      progressValue={progressValue}
      currentStepLabel={dashboard?.currentStepLabel ?? '核心安装进行中...'}
      completedCount={completedCount}
      timelineItems={step4TimelineItems}
      installLogTail={installLogTail}
      diagnosticsInfo={diagnosticsInfo}
      timelineContainerRef={timelineContainerRef}
      animated
    />
  );
}
