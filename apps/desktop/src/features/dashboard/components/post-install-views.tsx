import { AlertIcon } from '@/components/icons';
import type {
  OpenClawDingtalkChannelSetupPayload,
  OpenClawDingtalkChannelSetupResult,
  OpenClawQqbotChannelSetupPayload,
  OpenClawQqbotChannelSetupResult,
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  OpenClawSkillTogglePayload,
  PostInstallTab,
  ManagedSkillCatalog,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  OpenClawInstallResult,
  OpenClawStopResult,
  UninstallPlan,
  UninstallResult
} from '@/openclaw/model/types';
import { ProviderSetupPanel } from './provider-setup-panel';
import { RuntimeOperationsPanel } from './runtime-operations-panel';
import { ChannelsPanel } from '../channels/panel';
import { ServiceControlPanel } from './service-control-panel';
import { SkillsManagementPanel } from './skills-management-panel';
import { SettingsPanel } from './settings-panel';
import { UninstallPanel } from './uninstall-panel';
import type { DesktopUpdateStatus, DesktopVersionInfo } from '@/hooks/use-desktop-updater';
import type { Update } from '@tauri-apps/plugin-updater';

type PostInstallHomeViewProps = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  providerSetupLoading: boolean;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  dingtalkSetupLoading: boolean;
  dingtalkSetupResult: OpenClawDingtalkChannelSetupResult | null;
  qqbotSetupLoading: boolean;
  qqbotSetupResult: OpenClawQqbotChannelSetupResult | null;
  pluginInstallResult: OpenClawPluginInstallResult | null;
  skillCatalog: ManagedSkillCatalog | null;
  skillCatalogLoading: boolean;
  skillToggleLoadingIds: string[];
  runtimeLaunchLoading: boolean;
  runtimeStopLoading: boolean;
  runtimeRestartLoading: boolean;
  controlPanelOpening?: boolean;
  installationDirOpening?: boolean;
  logsDirOpening?: boolean;
  uninstallPlanLoading: boolean;
  uninstallExecuting: boolean;
  uninstallPlan: UninstallPlan | null;
  uninstallResult: UninstallResult | null;
  onProviderSetup: (input: OpenClawProviderSetupPayload) => Promise<OpenClawProviderSetupResult | null>;
  onFeishuChannelSetup: (input: OpenClawFeishuChannelSetupPayload) => Promise<OpenClawFeishuChannelSetupResult | null>;
  onDingtalkChannelSetup: (
    input: OpenClawDingtalkChannelSetupPayload
  ) => Promise<OpenClawDingtalkChannelSetupResult | null>;
  onQqbotChannelSetup: (
    input: OpenClawQqbotChannelSetupPayload
  ) => Promise<OpenClawQqbotChannelSetupResult | null>;
  onReloadSkillCatalog: (configPath: string) => Promise<ManagedSkillCatalog | null>;
  onSkillToggle: (input: OpenClawSkillTogglePayload) => Promise<unknown>;
  onLaunchRuntime: (configPath: string) => Promise<unknown>;
  onStopRuntime: (configPath: string, pid?: number | null) => Promise<OpenClawStopResult | null>;
  onRestartRuntime: (configPath: string, pid?: number | null) => Promise<unknown>;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  onOpenInstallationDirectory?: (path: string) => Promise<string | null>;
  onOpenLogsDirectory?: (configPath: string) => Promise<string | null>;
  onInspectUninstallPlan: (installationId: string) => Promise<UninstallPlan | null>;
  onExecuteUninstall: (
    installationId: string,
    selectedScopes: string[],
    typedConfirmation?: string | null
  ) => Promise<UninstallResult | null>;
  error?: string | null;
  onUninstallCompleted?: () => void;
  mode?: 'installed' | 'recovery';
  recoveryMessage?: string | null;
  importLoading?: boolean;
  onImportInstallation?: () => void;
  activeTab: PostInstallTab;
  onNavigateToProvider?: () => void;
  onNavigateToAdvancedConsole?: () => void;
  updater: {
    versionInfo: DesktopVersionInfo | null;
    status: DesktopUpdateStatus;
    availableUpdate: Update | null;
    downloadProgress: number;
    lastCheckedAt: string | null;
    error: string | null;
    onCheckUpdate: () => Promise<unknown>;
    onInstallUpdate: () => Promise<unknown>;
  };
};

export function PostInstallHomeView({
  result,
  status,
  statusLoading,
  providerSetupLoading,
  feishuSetupLoading,
  feishuSetupResult,
  dingtalkSetupLoading,
  dingtalkSetupResult,
  qqbotSetupLoading,
  qqbotSetupResult,
  pluginInstallResult,
  skillCatalog,
  skillCatalogLoading,
  skillToggleLoadingIds,
  runtimeLaunchLoading,
  runtimeStopLoading,
  runtimeRestartLoading,
  controlPanelOpening = false,
  installationDirOpening = false,
  logsDirOpening = false,
  uninstallPlanLoading,
  uninstallExecuting,
  uninstallPlan,
  uninstallResult,
  onProviderSetup,
  onFeishuChannelSetup,
  onDingtalkChannelSetup,
  onQqbotChannelSetup,
  onReloadSkillCatalog,
  onSkillToggle,
  onLaunchRuntime,
  onStopRuntime,
  onRestartRuntime,
  onOpenControlPanel,
  onOpenInstallationDirectory,
  onOpenLogsDirectory,
  onInspectUninstallPlan,
  onExecuteUninstall,
  error,
  onUninstallCompleted,
  mode = 'installed',
  recoveryMessage,
  importLoading = false,
  onImportInstallation,
  activeTab,
  onNavigateToProvider,
  onNavigateToAdvancedConsole,
  updater
}: PostInstallHomeViewProps) {
  return (
    <div className="w-full h-full flex flex-col gap-6 animate-fade-in py-4 flex-1 min-h-0">
      {/* Recovery/Warning Message if present */}
      {mode === 'recovery' && recoveryMessage ? (
        <div className="rounded-xl border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] px-5 py-4 text-xs leading-relaxed text-[hsl(var(--body-strong))] flex items-start gap-3 animate-slide-in shadow-sm">
          <AlertIcon size={16} className="text-[hsl(var(--warning))] mt-0.5 flex-shrink-0" />
          <div className="flex flex-col gap-0.5">
            <strong className="font-semibold">当前实例存在待确认项：</strong>
            <span>{recoveryMessage}</span>
          </div>
        </div>
      ) : null}

      {/* Main Content Pane */}
      <div className="flex-1 w-full min-w-0 flex flex-col h-full relative">
        {activeTab === 'controls' ? (
          <ServiceControlPanel
            result={result}
            status={status}
            statusLoading={statusLoading}
            runtimeLaunchLoading={runtimeLaunchLoading}
            runtimeStopLoading={runtimeStopLoading}
            runtimeRestartLoading={runtimeRestartLoading}
            onLaunchRuntime={onLaunchRuntime}
            onStopRuntime={onStopRuntime}
            onRestartRuntime={onRestartRuntime}
            onNavigateToAdvancedConsole={onNavigateToAdvancedConsole}
            onNavigateToProvider={onNavigateToProvider}
            onOpenControlPanel={onOpenControlPanel}
            controlPanelOpening={controlPanelOpening}
          />
        ) : activeTab === 'advanced-console' ? (
          <RuntimeOperationsPanel
            result={result}
            status={status}
            statusLoading={statusLoading}
            runtimeLaunchLoading={runtimeLaunchLoading}
            runtimeStopLoading={runtimeStopLoading}
            runtimeRestartLoading={runtimeRestartLoading}
            controlPanelOpening={controlPanelOpening}
            installationDirOpening={installationDirOpening}
            logsDirOpening={logsDirOpening}
            error={error}
            onLaunchRuntime={onLaunchRuntime}
            onStopRuntime={onStopRuntime}
            onRestartRuntime={onRestartRuntime}
            onOpenControlPanel={onOpenControlPanel}
            onOpenInstallationDirectory={onOpenInstallationDirectory}
            onOpenLogsDirectory={onOpenLogsDirectory}
            onNavigateToProvider={onNavigateToProvider}
          />
        ) : activeTab === 'provider' ? (
          <ProviderSetupPanel
            result={result}
            status={status}
            providerSetupLoading={providerSetupLoading}
            runtimeLaunchLoading={runtimeLaunchLoading}
            statusLoading={statusLoading}
            onProviderSetup={onProviderSetup}
            mode={mode}
            importLoading={importLoading}
            onImportInstallation={onImportInstallation}
          />
        ) : activeTab === 'channels' ? (
          <ChannelsPanel
            result={result}
            status={status}
            statusLoading={statusLoading}
            feishuSetupLoading={feishuSetupLoading}
            feishuSetupResult={feishuSetupResult}
            dingtalkSetupLoading={dingtalkSetupLoading}
            dingtalkSetupResult={dingtalkSetupResult}
            qqbotSetupLoading={qqbotSetupLoading}
            qqbotSetupResult={qqbotSetupResult}
            pluginInstallResult={pluginInstallResult}
            onFeishuChannelSetup={onFeishuChannelSetup}
            onDingtalkChannelSetup={onDingtalkChannelSetup}
            onQqbotChannelSetup={onQqbotChannelSetup}
          />
        ) : activeTab === 'skills' ? (
          <SkillsManagementPanel
            result={result}
            catalog={skillCatalog}
            loading={skillCatalogLoading}
            toggleLoadingIds={skillToggleLoadingIds}
            onReloadCatalog={onReloadSkillCatalog}
            onSkillToggle={onSkillToggle}
          />
        ) : activeTab === 'settings' ? (
          <SettingsPanel
            versionInfo={updater.versionInfo}
            status={updater.status}
            availableUpdate={updater.availableUpdate}
            downloadProgress={updater.downloadProgress}
            lastCheckedAt={updater.lastCheckedAt}
            error={updater.error}
            onCheckUpdate={updater.onCheckUpdate}
            onInstallUpdate={updater.onInstallUpdate}
          />
        ) : (
          <UninstallPanel
            result={result}
            plan={uninstallPlan}
            planLoading={uninstallPlanLoading}
            executing={uninstallExecuting}
            uninstallResult={uninstallResult}
            error={error ?? null}
            onInspectPlan={onInspectUninstallPlan}
            onExecuteUninstall={onExecuteUninstall}
            onCompleted={onUninstallCompleted}
          />
        )}
      </div>
    </div>
  );
}
