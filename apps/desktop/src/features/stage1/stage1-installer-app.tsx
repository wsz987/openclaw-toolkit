import { findStepTitle } from './model/selectors';
import { createInstallResultFromRecord, useStage1Installer } from './hooks/use-stage1-installer';
import { Stage1Header } from './components/stage1-header';
import { Stage1Stepper } from './components/stage1-stepper';
import { ConfirmInstallDialog } from './components/confirm-install-dialog';
import { PostInstallEntryView } from './components/post-install-entry-view';
import { PostInstallHomeView } from './components/post-install-views';
import { ConfigStepView, ErrorStateView, PrecheckStepView, ProgressStageView } from './components/stage1-views';
import type { AppBootstrapState } from './model/types';

type Stage1Screen =
  | 'installed-post-install-entry'
  | 'installed-post-install-home'
  | 'install-failed'
  | 'post-install-entry'
  | 'post-install-home'
  | 'precheck'
  | 'config'
  | 'progress-deps'
  | 'progress-verify';

export function Stage1InstallerApp({
  bootstrapState,
  onExitInstalledHome,
  initialBaseDir
}: {
  bootstrapState?: AppBootstrapState | null;
  onExitInstalledHome?: () => void;
  initialBaseDir?: string | null;
}) {
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
    handleEnterPostInstallHome,
    handleLaunchRuntime,
    handleOpenControlPanel,
    handleOpenInstallationDirectory,
    handleOpenLogsDirectory,
    handlePickDirectory,
    handlePrimaryInstallAction,
    handleProviderSetup,
    installLogTail,
    importingInstallation,
    installActionLabel,
    installMode,
    installPlan,
    installationDirOpening,
    licenseKey,
    logsDirOpening,
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
    controlPanelOpening,
    showPostInstallHome,
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
    handleImportInstallation,
    confirmInstall
  } = useStage1Installer(initialBaseDir ?? bootstrapState?.settings.lastSelectedBaseDir ?? bootstrapState?.activeInstallation?.baseDir ?? null);

  const bootstrapResult = bootstrapState?.activeInstallation ? createInstallResultFromRecord(bootstrapState.activeInstallation) : null;
  const bootstrapStatus = bootstrapState?.status ?? null;
  const showInstalledHome = Boolean(
    bootstrapState &&
      (bootstrapState.screen === 'installedHome' || bootstrapState.screen === 'recovery') &&
      bootstrapResult
  );

  const screen: Stage1Screen = showInstalledHome
    ? showPostInstallHome
      ? 'installed-post-install-home'
      : 'installed-post-install-entry'
    : phase === 'failed' || Boolean(error)
      ? 'install-failed'
      : phase === 'succeeded' && result
        ? showPostInstallHome
          ? 'post-install-home'
          : 'post-install-entry'
        : wizardStep === 0
          ? 'precheck'
          : wizardStep === 1
            ? 'config'
            : wizardStep === 2
              ? 'progress-deps'
              : 'progress-verify';

  let content: React.ReactNode;

  if (screen === 'installed-post-install-home' && bootstrapResult) {
    content = (
      <PostInstallHomeView
        result={bootstrapResult}
        status={bootstrapStatus}
        statusLoading={false}
        providerSetupLoading={providerSetupLoading}
        providerSetupResult={providerSetupResult}
        runtimeLaunchLoading={runtimeLaunchLoading}
        runtimeLaunchResult={runtimeLaunchResult}
        controlPanelOpening={controlPanelOpening}
        installationDirOpening={installationDirOpening}
        logsDirOpening={logsDirOpening}
        onProviderSetup={handleProviderSetup}
        onLaunchRuntime={handleLaunchRuntime}
        onOpenControlPanel={handleOpenControlPanel}
        onOpenInstallationDirectory={handleOpenInstallationDirectory}
        onOpenLogsDirectory={handleOpenLogsDirectory}
        onBack={() => onExitInstalledHome?.()}
        mode={bootstrapState?.screen === 'recovery' ? 'recovery' : 'installed'}
        recoveryMessage={bootstrapState?.message ?? null}
        importLoading={importingInstallation}
        backLabel="返回安装向导"
        onImportInstallation={async () => {
          const imported = await handleImportInstallation();
          if (imported) {
            onExitInstalledHome?.();
          }
        }}
      />
    );
  } else if (screen === 'installed-post-install-entry' && bootstrapResult) {
    content = (
      <PostInstallEntryView
        result={bootstrapResult}
        status={bootstrapStatus}
        statusLoading={false}
        title={bootstrapState?.screen === 'recovery' ? '检测到已安装环境' : 'OpenClaw 已安装'}
        description={
          bootstrapState?.screen === 'recovery'
            ? '应用已恢复上次识别到的 OpenClaw 安装实例。请点击下一步，再进入初始化与授权或运行后操作。'
            : '当前设备已经安装 OpenClaw。请点击下一步，再进入初始化与授权或运行后操作。'
        }
        backLabel="返回安装向导"
        onContinue={handleEnterPostInstallHome}
        onBack={() => onExitInstalledHome?.()}
      />
    );
  } else if (screen === 'install-failed') {
    content = (
      <ErrorStateView
        errorMessage={error || dashboard?.message || '安装过程中发生未预期的异常错误。'}
        failedStepLabel={findStepTitle(dashboard?.failedStep) ?? '执行单元'}
        onBack={handleBackToConfig}
      />
    );
  } else if (screen === 'post-install-home' && result) {
    content = (
      <PostInstallHomeView
        result={result}
        status={postInstallStatus}
        statusLoading={postInstallLoading}
        providerSetupLoading={providerSetupLoading}
        providerSetupResult={providerSetupResult}
        runtimeLaunchLoading={runtimeLaunchLoading}
        runtimeLaunchResult={runtimeLaunchResult}
        controlPanelOpening={controlPanelOpening}
        installationDirOpening={installationDirOpening}
        logsDirOpening={logsDirOpening}
        onProviderSetup={handleProviderSetup}
        onLaunchRuntime={handleLaunchRuntime}
        onOpenControlPanel={handleOpenControlPanel}
        onOpenInstallationDirectory={handleOpenInstallationDirectory}
        onOpenLogsDirectory={handleOpenLogsDirectory}
        onBack={handleBackToConfig}
      />
    );
  } else if (screen === 'post-install-entry' && result) {
    content = (
      <PostInstallEntryView
        result={result}
        status={postInstallStatus}
        statusLoading={postInstallLoading}
        onContinue={handleEnterPostInstallHome}
        onBack={handleBackToConfig}
      />
    );
  } else if (screen === 'precheck') {
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
  } else if (screen === 'config') {
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
  } else if (screen === 'progress-deps') {
    content = (
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
  } else {
    content = (
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

  const showInstallerChrome = screen === 'precheck' || screen === 'config' || screen === 'progress-deps' || screen === 'progress-verify';

  return (
    <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
      <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
        {showInstallerChrome ? <Stage1Header openclawVersion={dashboard?.openclawVersion} nodeVersion={dashboard?.nodeVersion} /> : null}
        {showInstallerChrome ? <Stage1Stepper phase={phase} wizardStep={wizardStep} onStepSelect={setWizardStep} /> : null}
        {content}
      </div>

      {showInstallerChrome ? (
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
      ) : null}
    </main>
  );
}
