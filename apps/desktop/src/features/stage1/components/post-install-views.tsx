import { Button } from '../../../components/ui/button';
import { AlertIcon } from '../../../components/icons';
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
  onBack: () => void;
  mode?: 'installed' | 'recovery';
  recoveryMessage?: string | null;
  importLoading?: boolean;
  onImportInstallation?: () => void;
  backLabel?: string;
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
  onBack,
  mode = 'installed',
  recoveryMessage,
  importLoading = false,
  onImportInstallation,
  backLabel
}: PostInstallHomeViewProps) {
  const resolvedBackLabel = backLabel ?? (mode === 'recovery' ? '重新检测环境' : '返回配置首页');

  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in py-4">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[hsl(var(--hairline))] pb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] flex items-center justify-center text-[hsl(var(--primary))] flex-shrink-0 shadow-sm">
            <BrandSpike size={26} />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-normal tracking-tight text-[hsl(var(--ink))] md:text-3xl">
              OpenClaw 服务配置与控制
            </h2>
            <p className="text-xs text-[hsl(var(--muted))] mt-1 max-w-2xl">
              在此管理您的 OpenClaw 实例。配置火山引擎 API 授权接入，管理主程序服务生命周期，并快速访问日志与控制面板。
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onBack} className="hover:bg-[hsl(var(--surface-soft))] h-10 px-5 shadow-sm text-xs font-semibold">
            {resolvedBackLabel}
          </Button>
        </div>
      </div>

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

      {/* Two-Column Responsive Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        {/* Left Side: Configuration & API Setup */}
        <div className="lg:col-span-5 flex flex-col gap-6">
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
        </div>

        {/* Right Side: Runtime Controls & System Status */}
        <div className="lg:col-span-7 flex flex-col gap-6">
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
          />
        </div>
      </div>
    </div>
  );
}
