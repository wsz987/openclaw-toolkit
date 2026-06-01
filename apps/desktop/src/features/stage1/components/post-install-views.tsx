import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { CheckIcon } from '../../../components/icons';
import type {
  OpenClawLaunchResult,
  OpenClawPostInstallStatus,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  Stage1InstallResult
} from '../model/types';
import { PostInstallEntryView } from './post-install-entry-view';
import { ProviderSetupPanel } from './provider-setup-panel';
import { RuntimeOperationsPanel } from './runtime-operations-panel';

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
  const providerReady = status?.providerInitialized ?? false;
  const title = providerReady ? '运行后操作' : 'OpenClaw 初始化与授权';
  const description =
    providerReady
      ? '当前安装已完成初始化，可以直接执行启动、控制台访问和日常运行操作。'
      : '请先完成 Provider、API Key 与 Agent 权限初始化，完成后再进入运行后操作。';
  const resolvedBackLabel = backLabel ?? (mode === 'recovery' ? '重新检测环境' : '返回配置首页');

  return (
    <Card className="max-w-5xl mx-auto border-[hsl(var(--success)/0.3)] bg-[hsl(var(--canvas))] py-12 px-8 flex flex-col items-center animate-fade-in shadow-lg">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success))] text-[hsl(var(--success))] mb-6">
        <CheckIcon size={34} />
      </div>
      <CardHeader className="p-0 mb-6 text-center">
        <CardTitle className="text-3xl text-[hsl(var(--ink))]">{title}</CardTitle>
        <CardDescription className="text-sm text-[hsl(var(--body))] mt-2 max-w-2xl mx-auto">{description}</CardDescription>
      </CardHeader>
      <CardContent className="w-full p-0 mb-8 flex flex-col gap-6">
        {mode === 'recovery' && recoveryMessage ? (
          <div className="rounded-lg border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.08)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
            当前实例存在待确认项：{recoveryMessage}
          </div>
        ) : null}
        {!providerReady ? (
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
        )}
      </CardContent>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button variant="secondary" onClick={onBack}>
          {resolvedBackLabel}
        </Button>
      </div>
    </Card>
  );
}
