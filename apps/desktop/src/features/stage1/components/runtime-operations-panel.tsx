import { Button } from '../../../components/ui/button';
import {
  ChevronRightIcon,
  EyeIcon,
  FolderIcon,
  MonitorIcon,
  PlayIcon,
  SpinnerIcon
} from '../../../components/icons';
import type { OpenClawLaunchResult, OpenClawPostInstallStatus, Stage1InstallResult } from '../model/types';

type RuntimeOperationsPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  runtimeLaunchLoading: boolean;
  runtimeLaunchResult: OpenClawLaunchResult | null;
  controlPanelOpening: boolean;
  installationDirOpening: boolean;
  logsDirOpening: boolean;
  onLaunchRuntime: (configPath: string) => Promise<OpenClawLaunchResult | null>;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  onOpenInstallationDirectory?: (path: string) => Promise<string | null>;
  onOpenLogsDirectory?: (configPath: string) => Promise<string | null>;
};

export function RuntimeOperationsPanel({
  result,
  status,
  statusLoading,
  runtimeLaunchLoading,
  runtimeLaunchResult,
  controlPanelOpening,
  installationDirOpening,
  logsDirOpening,
  onLaunchRuntime,
  onOpenControlPanel,
  onOpenInstallationDirectory,
  onOpenLogsDirectory
}: RuntimeOperationsPanelProps) {
  const providerReady = status?.providerInitialized ?? false;
  const postInstallActionLoading = runtimeLaunchLoading || statusLoading;

  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-[hsl(var(--ink))]">{providerReady ? '运行后操作' : '完成初始化后的可用入口'}</h3>
        <p className="text-xs leading-relaxed text-[hsl(var(--muted))] mt-1">
          {providerReady ? '下面展示启动后最常用的运行入口与当前状态。' : '完成初始化后，这里会成为用户后续最常进入的运行操作区。'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="block text-sm text-[hsl(var(--body-strong))]">OpenClaw 启动状态</strong>
              <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                {runtimeLaunchResult ? '已通过受管 Node 启动' : providerReady ? '尚未从安装器执行启动' : '初始化完成后可从这里启动'}
              </p>
            </div>
            <MonitorIcon size={18} className={runtimeLaunchResult ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-soft))]'} />
          </div>
        </div>

        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <strong className="block text-sm text-[hsl(var(--body-strong))]">OpenClaw 控制台地址</strong>
          <code className="mt-2 block text-xs font-mono text-[hsl(var(--ink))] break-all">
            {statusLoading ? '状态加载中...' : status?.controlUiUrl ?? '待启动后可访问 http://127.0.0.1:18789/'}
          </code>
        </div>

        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <strong className="block text-sm text-[hsl(var(--body-strong))]">插件能力状态</strong>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--body))]">
            飞书插件：{status?.feishuPluginEnabled ? '已启用' : '待启用'}；已启用插件：
            {status?.pluginsEnabled.length ? ` ${status.pluginsEnabled.join(', ')}` : ' 暂无'}。
          </p>
        </div>

        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <strong className="block text-sm text-[hsl(var(--body-strong))]">Skills 与工作区</strong>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--body))]">
            Skills：{status?.skillsInstalled.length ? status.skillsInstalled.join(', ') : '未识别'}。
          </p>
          <code className="mt-2 block text-xs font-mono text-[hsl(var(--ink))] break-all">
            {status?.workspaceDir ?? result.openclawDir}
          </code>
        </div>

        {providerReady ? (
          <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
            <strong className="block text-sm text-[hsl(var(--body-strong))]">快速操作</strong>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={postInstallActionLoading || !status}
                onClick={() => void onLaunchRuntime(result.configPath)}
              >
                {runtimeLaunchLoading ? (
                  <>
                    <SpinnerIcon size={14} className="spinning mr-2" />
                    启动中
                  </>
                ) : (
                  <>
                    <PlayIcon size={12} className="mr-2" />
                    启动 OpenClaw
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                disabled={postInstallActionLoading || !status || !onOpenControlPanel}
                onClick={() => void onOpenControlPanel?.(result.configPath)}
              >
                {controlPanelOpening ? (
                  <>
                    <SpinnerIcon size={14} className="spinning mr-2" />
                    打开中
                  </>
                ) : (
                  <>
                    <EyeIcon size={14} className="mr-2" />
                    打开控制面板
                  </>
                )}
              </Button>
            </div>
            {runtimeLaunchResult ? (
              <div className="mt-3 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
                OpenClaw 已启动，进程 PID：`{runtimeLaunchResult.pid}`，日志文件：`{runtimeLaunchResult.logPath}`。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.08)] p-4">
            <strong className="block text-sm text-[hsl(var(--body-strong))]">当前建议</strong>
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--body))]">
              先在左侧完成 OpenClaw 初始化与授权。完成后，本区将自动切换为启动与运行后操作入口。
            </p>
          </div>
        )}

        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <strong className="block text-sm text-[hsl(var(--body-strong))]">目录与日志入口</strong>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={!onOpenInstallationDirectory || installationDirOpening}
              onClick={() => void onOpenInstallationDirectory?.(result.openclawDir)}
            >
              {installationDirOpening ? (
                <>
                  <SpinnerIcon size={14} className="spinning mr-2" />
                  打开中
                </>
              ) : (
                <>
                  <FolderIcon size={14} className="mr-2" />
                  打开安装目录
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              disabled={!onOpenLogsDirectory || logsDirOpening}
              onClick={() => void onOpenLogsDirectory?.(result.configPath)}
            >
              {logsDirOpening ? (
                <>
                  <SpinnerIcon size={14} className="spinning mr-2" />
                  打开中
                </>
              ) : (
                <>
                  <ChevronRightIcon size={14} className="mr-2" />
                  打开日志目录
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
