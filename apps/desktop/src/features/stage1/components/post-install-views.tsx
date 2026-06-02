import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { AlertIcon, MonitorIcon, KeyIcon, ArrowLeftIcon } from '../../../components/icons';
import type {
  OpenClawLaunchResult,
  OpenClawPostInstallStatus,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  Stage1InstallResult
} from '../model/types';
import { ProviderSetupPanel } from './provider-setup-panel';
import { RuntimeOperationsPanel } from './runtime-operations-panel';
import { BrandSpike } from './brand-spike';

type PostInstallHomeViewProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  providerSetupLoading: boolean;
  providerSetupResult: OpenClawProviderSetupResult | null;
  runtimeLaunchLoading: boolean;
  runtimeLaunchResult: OpenClawLaunchResult | null;
  controlPanelOpening?: boolean;
  installationDirOpening?: boolean;
  logsDirOpening?: boolean;
  onProviderSetup: (input: OpenClawProviderSetupPayload) => Promise<OpenClawProviderSetupResult | null>;
  onLaunchRuntime: (configPath: string) => Promise<OpenClawLaunchResult | null>;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  onOpenInstallationDirectory?: (path: string) => Promise<string | null>;
  onOpenLogsDirectory?: (configPath: string) => Promise<string | null>;
  mode?: 'installed' | 'recovery';
  recoveryMessage?: string | null;
  importLoading?: boolean;
  onImportInstallation?: () => void;
  activeTab: 'operations' | 'provider';
  onNavigateToProvider?: () => void;
};

export function PostInstallHomeView({
  result,
  status,
  statusLoading,
  providerSetupLoading,
  providerSetupResult,
  runtimeLaunchLoading,
  runtimeLaunchResult,
  controlPanelOpening = false,
  installationDirOpening = false,
  logsDirOpening = false,
  onProviderSetup,
  onLaunchRuntime,
  onOpenControlPanel,
  onOpenInstallationDirectory,
  onOpenLogsDirectory,
  mode = 'installed',
  recoveryMessage,
  importLoading = false,
  onImportInstallation,
  activeTab,
  onNavigateToProvider
}: PostInstallHomeViewProps) {
  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in py-4">
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
      <div className="flex-1 w-full min-w-0">
        {activeTab === 'operations' ? (
          <RuntimeOperationsPanel
            result={result}
            status={status}
            statusLoading={statusLoading}
            runtimeLaunchLoading={runtimeLaunchLoading}
            runtimeLaunchResult={runtimeLaunchResult}
            controlPanelOpening={controlPanelOpening}
            installationDirOpening={installationDirOpening}
            logsDirOpening={logsDirOpening}
            onLaunchRuntime={onLaunchRuntime}
            onOpenControlPanel={onOpenControlPanel}
            onOpenInstallationDirectory={onOpenInstallationDirectory}
            onOpenLogsDirectory={onOpenLogsDirectory}
            onNavigateToProvider={onNavigateToProvider}
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}
