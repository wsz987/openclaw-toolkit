import { useState, useEffect } from 'react';
import { findStepTitle } from './model/selectors';
import { createInstallResultFromRecord, useStage1Installer } from './hooks/use-stage1-installer';
import { Stage1Header } from './components/stage1-header';
import { Stage1Stepper } from './components/stage1-stepper';
import { ConfirmInstallDialog } from './components/confirm-install-dialog';
import { PostInstallEntryView } from './components/post-install-entry-view';
import { PostInstallHomeView } from './components/post-install-views';
import { ConfigStepView, ErrorStateView, PrecheckStepView, ProgressStageView } from './components/stage1-views';
import type { AppBootstrapState } from './model/types';
import { BrandSpike } from './components/brand-spike';
import { MonitorIcon, KeyIcon, MessageSquareIcon } from '../../components/icons';
import {
  getRecoveredInstallationMode,
  isRecoveredInstallationState,
  resolveStage1Screen,
  shouldShowInstallerChrome
} from './model/app-flow';

type PostInstallMenuProps = {
  activeTab: 'operations' | 'provider' | 'channels';
  onTabSelect: (tab: 'operations' | 'provider' | 'channels') => void;
  providerReady: boolean;
  feishuEnabled: boolean;
};

export function PostInstallMenu({ activeTab, onTabSelect, providerReady, feishuEnabled }: PostInstallMenuProps) {
  return (
    <div className="flex flex-col gap-4 w-full py-4 select-none">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))] mb-1 pl-1">
        管理与配置
      </div>
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => onTabSelect('operations')}
          className={`w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border ${activeTab === 'operations'
            ? 'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold'
            : 'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent'
            }`}
        >
          <MonitorIcon size={14} className={activeTab === 'operations' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'} />
          <div className="flex flex-col">
            <span className={`text-xs font-semibold leading-tight ${activeTab === 'operations' ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'}`}>
              运行控制中心
            </span>
            <span className="text-[9px] text-[hsl(var(--muted-soft))]">
              实例服务生命周期管理
            </span>
          </div>
        </button>

        <button
          onClick={() => onTabSelect('provider')}
          className={`w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border ${activeTab === 'provider'
            ? 'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold'
            : 'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent'
            }`}
        >
          <div className="relative">
            <KeyIcon size={14} className={activeTab === 'provider' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'} />
            {!providerReady && (
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse absolute -top-1 -right-1" />
            )}
          </div>
          <div className="flex flex-col">
            <span className={`text-xs font-semibold leading-tight ${activeTab === 'provider' ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'}`}>
              API 授权与接入
            </span>
            <span className="text-[9px] text-[hsl(var(--muted-soft))]">
              服务商与工具策略配置
            </span>
          </div>
        </button>

        <button
          onClick={() => onTabSelect('channels')}
          className={`w-full text-left px-4 py-3.5 rounded-lg flex items-center gap-3 transition-all duration-200 cursor-pointer border ${activeTab === 'channels'
            ? 'bg-[hsl(var(--canvas))] text-[hsl(var(--primary))] border-[hsl(var(--hairline))] shadow-[0_2px_6px_rgba(20,20,19,0.04)] ring-3 ring-[hsl(var(--primary)/0.12)] font-semibold'
            : 'bg-transparent hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--muted))] border-transparent'
            }`}
        >
          <div className="relative">
            <MessageSquareIcon size={14} className={activeTab === 'channels' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-soft))]'} />
            {feishuEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] absolute -top-1 -right-1" />
            )}
          </div>
          <div className="flex flex-col">
            <span className={`text-xs font-semibold leading-tight ${activeTab === 'channels' ? 'text-[hsl(var(--ink))]' : 'text-[hsl(var(--body-strong))]'}`}>
              Channels
            </span>
            <span className="text-[9px] text-[hsl(var(--muted-soft))]">
              Feishu 内置通道与扩展入口
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

export function Stage1InstallerApp({
  bootstrapState,
  onExitInstalledHome,
  initialBaseDir,
  initialWizardStep
}: {
  bootstrapState?: AppBootstrapState | null;
  onExitInstalledHome?: () => void;
  initialBaseDir?: string | null;
  initialWizardStep?: 0 | 1 | 2 | 3;
}) {
  const shouldOpenInstalledHomeDirectly = isRecoveredInstallationState(bootstrapState);

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
    feishuSetupLoading,
    feishuSetupResult,
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
    handleFeishuChannelSetup,
    handleImportInstallation,
    confirmInstall
  } = useStage1Installer(
    initialBaseDir ?? bootstrapState?.settings.lastSelectedBaseDir ?? bootstrapState?.activeInstallation?.baseDir ?? null,
    shouldOpenInstalledHomeDirectly,
    initialWizardStep
  );

  const bootstrapResult = bootstrapState?.activeInstallation ? createInstallResultFromRecord(bootstrapState.activeInstallation) : null;
  const bootstrapStatus = bootstrapState?.status ?? null;

  const providerReady = (postInstallStatus ?? bootstrapStatus)?.providerInitialized ?? false;
  const feishuEnabled = (postInstallStatus ?? bootstrapStatus)?.feishuChannel.enabled ?? false;
  const [activeTab, setActiveTab] = useState<'operations' | 'provider' | 'channels'>('operations');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  useEffect(() => {
    const resolvedStatus = postInstallStatus ?? bootstrapStatus;
    if (resolvedStatus && !hasInitializedTab) {
      setActiveTab(resolvedStatus.providerInitialized ? 'operations' : 'provider');
      setHasInitializedTab(true);
    }
  }, [postInstallStatus, bootstrapStatus, hasInitializedTab]);

  const screen = resolveStage1Screen({
    bootstrapState,
    hasError: Boolean(error),
    hasInstallResult: Boolean(result),
    phase,
    showPostInstallHome,
    wizardStep
  });

  let content: React.ReactNode;

  if (screen === 'installed-home' && bootstrapResult) {
    content = (
      <PostInstallHomeView
        result={bootstrapResult}
        status={postInstallStatus ?? bootstrapStatus}
        statusLoading={postInstallLoading}
        providerSetupLoading={providerSetupLoading}
        providerSetupResult={providerSetupResult}
        runtimeLaunchLoading={runtimeLaunchLoading}
        runtimeLaunchResult={runtimeLaunchResult}
        controlPanelOpening={controlPanelOpening}
        installationDirOpening={installationDirOpening}
        logsDirOpening={logsDirOpening}
        feishuSetupLoading={feishuSetupLoading}
        feishuSetupResult={feishuSetupResult}
        onProviderSetup={handleProviderSetup}
        onFeishuChannelSetup={handleFeishuChannelSetup}
        onLaunchRuntime={handleLaunchRuntime}
        onOpenControlPanel={handleOpenControlPanel}
        onOpenInstallationDirectory={handleOpenInstallationDirectory}
        onOpenLogsDirectory={handleOpenLogsDirectory}
        mode={getRecoveredInstallationMode(bootstrapState)}
        recoveryMessage={bootstrapState?.message ?? null}
        importLoading={importingInstallation}
        onImportInstallation={async () => {
          const imported = await handleImportInstallation();
          if (imported) {
            onExitInstalledHome?.();
          }
        }}
        activeTab={activeTab}
        onNavigateToProvider={() => setActiveTab('provider')}
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
        feishuSetupLoading={feishuSetupLoading}
        feishuSetupResult={feishuSetupResult}
        onProviderSetup={handleProviderSetup}
        onFeishuChannelSetup={handleFeishuChannelSetup}
        onLaunchRuntime={handleLaunchRuntime}
        onOpenControlPanel={handleOpenControlPanel}
        onOpenInstallationDirectory={handleOpenInstallationDirectory}
        onOpenLogsDirectory={handleOpenLogsDirectory}
        activeTab={activeTab}
        onNavigateToProvider={() => setActiveTab('provider')}
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

  const isPostInstall = screen === 'installed-home' || screen === 'post-install-home';
  const showInstallerChrome = shouldShowInstallerChrome(screen) || isPostInstall;
  const onBackAction = screen === 'installed-home' ? (() => onExitInstalledHome?.()) : (screen === 'post-install-home' ? handleBackToConfig : undefined);

  if (showInstallerChrome) {
    return (
      <main className="app-shell flex h-screen w-screen overflow-hidden bg-[hsl(var(--canvas))] animate-fade-in">
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-8 flex flex-col justify-between h-full overflow-y-auto flex-shrink-0">
          <div className="flex flex-col gap-8">
            {isPostInstall ? (
              <header className="flex flex-col gap-6 select-none">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <BrandSpike size={14} className="text-[hsl(var(--ink))]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
                      OpenClaw Dashboard
                    </span>
                  </div>
                  <h1 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight leading-tight">
                    服务配置与控制
                  </h1>
                </div>

                {dashboard?.openclawVersion ? (
                  <div className="flex flex-col gap-1 bg-[hsl(var(--surface-cream-strong))] border border-[hsl(var(--hairline))] rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="badge-pill bg-[hsl(var(--surface-card))] text-[hsl(var(--ink))] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted))] font-medium">
                        当前运行版本
                      </span>
                    </div>
                    <strong className="font-serif text-xl text-[hsl(var(--primary))] font-normal leading-none mt-1">
                      v{dashboard.openclawVersion}
                    </strong>
                    <span className="text-xs text-[hsl(var(--muted-soft))] font-medium mt-0.5">
                      Node {dashboard.nodeVersion || 'v20.11.0'}
                    </span>
                  </div>
                ) : null}
              </header>
            ) : (
              <Stage1Header
                openclawVersion={dashboard?.openclawVersion}
                nodeVersion={dashboard?.nodeVersion}
                layout="vertical"
              />
            )}
            {isPostInstall ? (
              <PostInstallMenu
                activeTab={activeTab}
                onTabSelect={setActiveTab}
                providerReady={providerReady}
                feishuEnabled={feishuEnabled}
              />
            ) : (
              <Stage1Stepper
                phase={phase}
                wizardStep={wizardStep}
                onStepSelect={setWizardStep}
                layout="vertical"
              />
            )}
          </div>
          {/* Footer actions & info */}
          <div className="flex flex-col gap-4 pt-4 border-t border-[hsl(var(--hairline))]">
            <div className="text-[10px] text-[hsl(var(--muted-soft))] font-medium flex items-center justify-between">
              <span>OpenClaw Core</span>
              <span>v{dashboard?.openclawVersion || '1.0.0'}</span>
            </div>
          </div>
        </aside>

        {/* Right Main Content */}
        <section className="flex-1 flex flex-col min-h-0 bg-[hsl(var(--canvas))] overflow-y-auto">
          <div className={`max-w-[1000px] w-full mx-auto flex-1 flex flex-col min-h-0 ${isPostInstall ? 'py-8 px-6' : ''}`}>
            {content}
          </div>
        </section>

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

  return (
    <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
      <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
        {content}
      </div>
    </main>
  );
}
