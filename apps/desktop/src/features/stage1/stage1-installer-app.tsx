import { stage1Steps } from './model/graph';
import { findStepTitle } from './model/selectors';
import { useStage1Installer } from './hooks/use-stage1-installer';
import { Stage1Header } from './components/stage1-header';
import { Stage1Stepper } from './components/stage1-stepper';
import { ConfirmInstallDialog } from './components/confirm-install-dialog';
import {
  ConfigStepView,
  ErrorStateView,
  PrecheckStepView,
  ProgressStageView,
  SuccessStateView
} from './components/stage1-views';

export function Stage1InstallerApp() {
  const {
    baseDir,
    canStartInstall,
    completedCount,
    confirmDialogOpen,
    confirmationDescription,
    confirmationTargetVersion,
    dashboard,
    dashboardLoading,
    diagnosticsInfo,
    error,
    handleBackToConfig,
    handleLaunchRuntime,
    handlePickDirectory,
    handlePrimaryInstallAction,
    handleProviderSetup,
    installActionLabel,
    installMode,
    installPlan,
    licenseKey,
    loading,
    phase,
    postInstallLoading,
    postInstallStatus,
    progressValue,
    providerSetupLoading,
    providerSetupResult,
    result,
    runtimeLaunchLoading,
    runtimeLaunchResult,
    selectedVersion,
    selectedVersionOption,
    setBaseDir,
    setConfirmDialogOpen,
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
    versionCatalogLoading,
    wizardStep,
    confirmInstall
  } = useStage1Installer();

  let content: React.ReactNode;

  if (phase === 'failed' || error) {
    content = (
      <ErrorStateView
        errorMessage={error || dashboard?.message || '安装过程中发生未预期的异常错误。'}
        failedStepLabel={findStepTitle(dashboard?.failedStep) ?? '执行单元'}
        onBack={handleBackToConfig}
      />
    );
  } else if (phase === 'succeeded' && result) {
    content = (
      <SuccessStateView
        result={result}
        status={postInstallStatus}
        statusLoading={postInstallLoading}
        providerSetupLoading={providerSetupLoading}
        providerSetupResult={providerSetupResult}
        runtimeLaunchLoading={runtimeLaunchLoading}
        runtimeLaunchResult={runtimeLaunchResult}
        onProviderSetup={handleProviderSetup}
        onLaunchRuntime={handleLaunchRuntime}
        onBack={handleBackToConfig}
      />
    );
  } else if (wizardStep === 0) {
    content = (
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
  } else if (wizardStep === 1) {
    content = (
      <ConfigStepView
        licenseKey={licenseKey}
        installMode={installMode}
        selectedVersion={selectedVersion}
        versionCatalogLoading={versionCatalogLoading}
        versionCatalog={versionCatalog}
        selectedVersionOption={selectedVersionOption}
        systemOpenclaw={systemOpenclaw}
        installActionLabel={installActionLabel}
        confirmationTargetVersion={confirmationTargetVersion}
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
  } else if (wizardStep === 2) {
    content = (
      <ProgressStageView
        title="步骤 3: 运行环境依赖部署"
        subtitle="正在安装 Node 及 OpenClaw 核心制品..."
        timelineDescription="步骤 1-9: 基础环境与依赖写入"
        progressValue={progressValue}
        currentStepLabel={dashboard?.currentStepLabel ?? '核心安装进行中...'}
        completedCount={completedCount}
        timelineItems={step3TimelineItems}
        diagnosticsInfo={diagnosticsInfo}
        timelineContainerRef={timelineContainerRef}
      />
    );
  } else {
    content = (
      <ProgressStageView
        title="步骤 4: 写入配置与服务验证"
        subtitle="写入 openclaw.json 系统配置及 Skills 数据，开启首次冷启动联调校验..."
        timelineDescription="步骤 10-15: 系统配置写入及启动校验"
        progressValue={progressValue}
        currentStepLabel={dashboard?.currentStepLabel ?? '核心安装进行中...'}
        completedCount={completedCount}
        timelineItems={step4TimelineItems}
        diagnosticsInfo={diagnosticsInfo}
        timelineContainerRef={timelineContainerRef}
        animated
      />
    );
  }

  return (
    <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
      <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
        <Stage1Header openclawVersion={dashboard?.openclawVersion} nodeVersion={dashboard?.nodeVersion} />
        <Stage1Stepper phase={phase} wizardStep={wizardStep} onStepSelect={setWizardStep} />
        {content}
      </div>

      <ConfirmInstallDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        loading={loading}
        confirmationDescription={confirmationDescription}
        systemOpenclaw={systemOpenclaw}
        confirmationTargetVersion={confirmationTargetVersion}
        installPlan={installPlan}
        installActionLabel={installActionLabel}
        onConfirm={() => void confirmInstall()}
      />
    </main>
  );
}
