import { useEffect, useState } from 'react';
import { BrandSpike } from './brand-spike';
import { PostInstallHomeView } from './post-install-views';
import { PostInstallMenu } from './post-install-menu';
import { Stage1Shell } from './stage1-shell';
import { createInstallResultFromRecord, type Stage1InstallerController } from '../hooks/use-stage1-installer';
import type { AppBootstrapState, PostInstallTab } from '../model/types';
import { getRecoveredInstallationMode } from '../model/app-flow';
import { useOpenClawStatusSubscription } from '../model/openclaw-status-store';

type PostInstallHomeScreenProps = {
  bootstrapState?: AppBootstrapState | null;
  controller: Stage1InstallerController;
  onExitInstalledHome?: () => void;
};

export function PostInstallHomeScreen({
  bootstrapState,
  controller,
  onExitInstalledHome
}: PostInstallHomeScreenProps) {
  const bootstrapResult = bootstrapState?.activeInstallation
    ? createInstallResultFromRecord(bootstrapState.activeInstallation)
    : null;
  const bootstrapStatus = bootstrapState?.status ?? null;
  const result = controller.result ?? bootstrapResult;
  const { status: subscribedStatus, loading: subscribedStatusLoading } = useOpenClawStatusSubscription(result?.configPath);
  const resolvedStatus = subscribedStatus ?? controller.postInstallStatus ?? bootstrapStatus;
  const providerReady = resolvedStatus?.providerInitialized ?? false;
  const feishuEnabled = resolvedStatus?.feishuChannel.enabled ?? false;

  const [activeTab, setActiveTab] = useState<PostInstallTab>('controls');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  useEffect(() => {
    if (resolvedStatus && !hasInitializedTab) {
      setActiveTab(resolvedStatus.providerInitialized ? 'controls' : 'provider');
      setHasInitializedTab(true);
    }
  }, [resolvedStatus, hasInitializedTab]);

  useEffect(() => {
    console.info(
      `[服务配置与控制] 已渲染侧边栏，当前页面：${activeTab}，Skill 管理入口已挂载。`
    );
  }, [activeTab]);

  if (!result) {
    return null;
  }

  return (
    <Stage1Shell
      sidebar={
        <>
          <header className="flex flex-col gap-6 select-none">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <BrandSpike size={14} className="text-[hsl(var(--ink))]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
                  OpenClaw Dashboard
                </span>
              </div>
              <h1 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight leading-tight">
                控制面板
              </h1>
            </div>

            {/* {controller.dashboard?.openclawVersion ? (
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
                  v{controller.dashboard.openclawVersion}
                </strong>
                <span className="text-xs text-[hsl(var(--muted-soft))] font-medium mt-0.5">
                  Node {controller.dashboard.nodeVersion || 'v20.11.0'}
                </span>
              </div>
            ) : null} */}
          </header>
          <PostInstallMenu
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            providerReady={providerReady}
            feishuEnabled={feishuEnabled}
          />
        </>
      }
      footer={
        <div className="text-[10px] text-[hsl(var(--muted-soft))] font-medium flex items-center justify-between">
          <span>OpenClaw Core</span>
          <span>v{controller.dashboard?.openclawVersion || '1.0.0'}</span>
        </div>
      }
      content={
        <PostInstallHomeView
          result={result}
          status={resolvedStatus}
          statusLoading={subscribedStatusLoading}
          providerSetupLoading={controller.providerSetupLoading}
          feishuSetupLoading={controller.feishuSetupLoading}
          feishuSetupResult={controller.feishuSetupResult}
          dingtalkSetupLoading={controller.dingtalkSetupLoading}
          dingtalkSetupResult={controller.dingtalkSetupResult}
          qqbotSetupLoading={controller.qqbotSetupLoading}
          qqbotSetupResult={controller.qqbotSetupResult}
          pluginInstallResult={controller.pluginInstallResult}
          skillCatalog={controller.skillCatalog}
          skillCatalogLoading={controller.skillCatalogLoading}
          skillToggleLoadingIds={controller.skillToggleLoadingIds}
          runtimeLaunchLoading={controller.runtimeLaunchLoading}
          runtimeStopLoading={controller.runtimeStopLoading}
          runtimeRestartLoading={controller.runtimeRestartLoading}
          controlPanelOpening={controller.controlPanelOpening}
          installationDirOpening={controller.installationDirOpening}
          logsDirOpening={controller.logsDirOpening}
          uninstallPlanLoading={controller.uninstallPlanLoading}
          uninstallExecuting={controller.uninstallExecuting}
          uninstallPlan={controller.uninstallPlan}
          uninstallResult={controller.uninstallResult}
          onProviderSetup={controller.handleProviderSetup}
          onFeishuChannelSetup={controller.handleFeishuChannelSetup}
          onDingtalkChannelSetup={controller.handleDingtalkChannelSetup}
          onQqbotChannelSetup={controller.handleQqbotChannelSetup}
          onReloadSkillCatalog={controller.loadSkillCatalog}
          onSkillToggle={controller.handleSkillToggle}
          onLaunchRuntime={controller.handleLaunchRuntime}
          onStopRuntime={controller.handleStopRuntime}
          onRestartRuntime={controller.handleRestartRuntime}
          onOpenControlPanel={controller.handleOpenControlPanel}
          onOpenInstallationDirectory={controller.handleOpenInstallationDirectory}
          onOpenLogsDirectory={controller.handleOpenLogsDirectory}
          onInspectUninstallPlan={controller.handleInspectUninstallPlan}
          onExecuteUninstall={controller.handleExecuteUninstall}
          error={controller.error}
          onUninstallCompleted={onExitInstalledHome}
          mode={bootstrapResult ? getRecoveredInstallationMode(bootstrapState) : undefined}
          recoveryMessage={bootstrapResult ? bootstrapState?.message ?? null : undefined}
          importLoading={controller.importingInstallation}
          onImportInstallation={
            bootstrapResult
              ? async () => {
                const imported = await controller.handleImportInstallation();
                if (imported) {
                  onExitInstalledHome?.();
                }
              }
              : undefined
          }
          activeTab={activeTab}
          onNavigateToProvider={() => setActiveTab('provider')}
          onNavigateToAdvancedConsole={() => setActiveTab('advanced-console')}
        />
      }
      contentClassName="overflow-hidden"
      contentInnerClassName="pt-4 px-6"
    />
  );
}
