import { AlertIcon } from '../../../components/icons';
import type {
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawPostInstallStatus,
  PostInstallTab,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  Stage1InstallResult
} from '../model/types';
import { ProviderSetupPanel } from './provider-setup-panel';
import { RuntimeOperationsPanel } from './runtime-operations-panel';
import { ChannelsPanel } from './channels-panel';
import { ServiceControlPanel } from './service-control-panel';

type PostInstallHomeViewProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  providerSetupLoading: boolean;
  providerSetupResult: OpenClawProviderSetupResult | null;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  runtimeLaunchLoading: boolean;
  runtimeStopLoading: boolean;
  runtimeRestartLoading: boolean;
  controlPanelOpening?: boolean;
  installationDirOpening?: boolean;
  logsDirOpening?: boolean;
  onProviderSetup: (input: OpenClawProviderSetupPayload) => Promise<OpenClawProviderSetupResult | null>;
  onFeishuChannelSetup: (input: OpenClawFeishuChannelSetupPayload) => Promise<OpenClawFeishuChannelSetupResult | null>;
  onLaunchRuntime: (configPath: string) => Promise<unknown>;
  onStopRuntime: (configPath: string, pid: number) => Promise<{ stopped: boolean } | null>;
  onRestartRuntime: (configPath: string, pid?: number | null) => Promise<unknown>;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  onOpenInstallationDirectory?: (path: string) => Promise<string | null>;
  onOpenLogsDirectory?: (configPath: string) => Promise<string | null>;
  mode?: 'installed' | 'recovery';
  recoveryMessage?: string | null;
  importLoading?: boolean;
  onImportInstallation?: () => void;
  activeTab: PostInstallTab;
  onNavigateToProvider?: () => void;
  onNavigateToAdvancedConsole?: () => void;
};

export function PostInstallHomeView({
  result,
  status,
  statusLoading,
  providerSetupLoading,
  providerSetupResult,
  feishuSetupLoading,
  feishuSetupResult,
  runtimeLaunchLoading,
  runtimeStopLoading,
  runtimeRestartLoading,
  controlPanelOpening = false,
  installationDirOpening = false,
  logsDirOpening = false,
  onProviderSetup,
  onFeishuChannelSetup,
  onLaunchRuntime,
  onStopRuntime,
  onRestartRuntime,
  onOpenControlPanel,
  onOpenInstallationDirectory,
  onOpenLogsDirectory,
  mode = 'installed',
  recoveryMessage,
  importLoading = false,
  onImportInstallation,
  activeTab,
  onNavigateToProvider,
  onNavigateToAdvancedConsole
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
            providerSetupResult={providerSetupResult}
            runtimeLaunchLoading={runtimeLaunchLoading}
            statusLoading={statusLoading}
            onProviderSetup={onProviderSetup}
            mode={mode}
            importLoading={importLoading}
            onImportInstallation={onImportInstallation}
          />
        ) : (
          <ChannelsPanel
            result={result}
            status={status}
            statusLoading={statusLoading}
            feishuSetupLoading={feishuSetupLoading}
            feishuSetupResult={feishuSetupResult}
            onFeishuChannelSetup={onFeishuChannelSetup}
          />
        )}
      </div>
    </div>
  );
}
