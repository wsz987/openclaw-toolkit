import { useEffect, useRef, useState } from 'react';
import { AnsiLogLine } from '@/components/ansi-log-line';
import { Button } from '@/components/ui/button';
import {
  ChevronRightIcon,
  EyeIcon,
  FolderIcon,
  MonitorIcon,
  PlayIcon,
  SpinnerIcon
} from '@/components/icons';
import { toast } from 'sonner';
import type {
  OpenClawPostInstallStatus,
  InstallLogTail,
  OpenClawInstallResult
} from '@/openclaw/model/types';
import { readOpenClawRuntimeLogTail } from '@/openclaw/api/client';
import { useOpenClawStatusSubscription } from '@/openclaw/model/status-store';

type RuntimeOperationsPanelProps = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  runtimeLaunchLoading: boolean;
  runtimeStopLoading: boolean;
  runtimeRestartLoading: boolean;
  controlPanelOpening: boolean;
  installationDirOpening: boolean;
  logsDirOpening: boolean;
  error?: string | null;
  onLaunchRuntime: (configPath: string) => Promise<unknown>;
  onStopRuntime: (configPath: string, pid: number) => Promise<{ stopped: boolean } | null>;
  onRestartRuntime: (configPath: string, pid?: number | null) => Promise<unknown>;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  onOpenInstallationDirectory?: (path: string) => Promise<string | null>;
  onOpenLogsDirectory?: (configPath: string) => Promise<string | null>;
  onNavigateToProvider?: () => void;
};

export function RuntimeOperationsPanel({
  result,
  status,
  statusLoading,
  runtimeLaunchLoading,
  runtimeStopLoading,
  runtimeRestartLoading,
  controlPanelOpening,
  installationDirOpening,
  logsDirOpening,
  error,
  onLaunchRuntime,
  onStopRuntime,
  onRestartRuntime,
  onOpenControlPanel,
  onOpenInstallationDirectory,
  onOpenLogsDirectory,
  onNavigateToProvider
}: RuntimeOperationsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [logTail, setLogTail] = useState<InstallLogTail | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const { status: subscribedStatus, loading: subscribedStatusLoading } = useOpenClawStatusSubscription(result.configPath);
  const resolvedStatus = subscribedStatus ?? status;
  const providerReady = resolvedStatus?.providerInitialized ?? false;
  const isStarting = resolvedStatus?.runtimeState === 'starting';
  const isRunning = resolvedStatus?.runtimeRunning ?? (resolvedStatus?.runtimeState === 'running');
  const launchPending = runtimeLaunchLoading || isStarting;
  const panelReachable = resolvedStatus?.panelReachable ?? false;
  const postInstallActionLoading =
    launchPending || runtimeStopLoading || runtimeRestartLoading || subscribedStatusLoading || statusLoading;
  const activeLogPath = resolvedStatus?.runtimeLogPath ?? null;
  const hasRuntimeSession = (isRunning || isStarting) && Boolean(activeLogPath);
  const runtimePid = resolvedStatus?.runtimePid ?? null;

  useEffect(() => {
    if (!hasRuntimeSession || !activeLogPath) {
      setLogTail(null);
      return;
    }

    const loadLogs = async () => {
      try {
        const response = await readOpenClawRuntimeLogTail(activeLogPath, 100);
        setLogTail(response);
      } catch (err) {
        console.error('Failed to load openclaw runtime logs:', err);
      }
    };

    void loadLogs();
    const timer = setInterval(() => {
      void loadLogs();
    }, 1000);

    return () => clearInterval(timer);
  }, [activeLogPath, hasRuntimeSession]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logTail?.lines]);

  const handleCopyConsoleUrl = async () => {
    const url = resolvedStatus?.controlUiUrl ?? 'http://127.0.0.1:18789/';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleOpenLogsDirectory = async () => {
    if (!onOpenLogsDirectory) {
      return;
    }

    const openedPath = await onOpenLogsDirectory(result.configPath);
    if (!openedPath) {
      toast.error('打开日志目录失败，请查看页面错误提示。');
    }
  };

  if (!providerReady) {
    return (
      <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface-dark))] text-[hsl(var(--on-dark))] p-6 flex flex-col gap-6 shadow-lg min-h-[460px] justify-between h-full flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h3 className="font-serif text-xl font-normal tracking-tight text-[hsl(var(--on-dark))]">运行控制中心</h3>
            <p className="text-xs leading-relaxed text-[hsl(var(--on-dark-soft))] mt-1">
              完成 API 授权与接入后解锁服务控制中心
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-white/5 text-[hsl(var(--on-dark-soft))] tracking-wide">
            未激活
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 gap-4 animate-fade-in">
          <div className="w-14 h-14 rounded-full border border-dashed border-white/20 flex items-center justify-center text-[hsl(var(--on-dark-soft))]">
            <MonitorIcon size={24} />
          </div>
          <div className="flex flex-col gap-1.5 max-w-sm">
            <strong className="text-sm font-medium text-[hsl(var(--on-dark))]">等待 API 授权配置就绪</strong>
            <p className="text-xs text-[hsl(var(--on-dark-soft))] leading-relaxed">
              请先在导航菜单中选择 “API 授权与接入” 完成服务商参数配置。配置就绪后，此操作面板将自动解锁启动入口与运行状态面板。
            </p>
          </div>
          {onNavigateToProvider && (
            <Button
              variant="default"
              onClick={onNavigateToProvider}
              className="mt-2 h-9 text-xs bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] border-0 px-4 rounded-md font-medium"
            >
              前往配置 API
            </Button>
          )}
        </div>

        <div className="bg-[hsl(var(--surface-dark-soft))] border border-white/5 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-white/40">
          <div>$ openclaw daemon --status</div>
          <div>[system-check] config: openclaw.json (not found)</div>
          <div>[system-check] provider: pending initial setup payload</div>
          <div className="animate-pulse">_</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface-dark))] text-[hsl(var(--on-dark))] p-6 flex flex-col gap-6 shadow-lg animate-fade-in h-full flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="font-serif text-xl font-normal tracking-tight text-[hsl(var(--on-dark))]">运行控制中心</h3>
          <p className="text-xs leading-relaxed text-[hsl(var(--on-dark-soft))] mt-1">
            监控 OpenClaw 服务状态并管理快速入口
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--success))] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--success))]"></span>
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--warning))]"></span>
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide ${isRunning
                ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
                : isStarting
                  ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]'
                  : 'bg-white/5 text-[hsl(var(--on-dark-soft))]'
              }`}
          >
            {isRunning ? '服务运行中' : isStarting ? '服务启动中' : '服务未启动'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[hsl(var(--surface-dark-soft))] border border-white/5 p-4 rounded-lg flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-[hsl(var(--on-dark-soft))] uppercase tracking-wider">控制台地址</span>
          <div className="flex items-center justify-between gap-2 mt-1">
            <code className="text-xs font-mono text-[hsl(var(--on-dark))] truncate break-all select-all">
              {subscribedStatusLoading || statusLoading ? '加载中...' : resolvedStatus?.controlUiUrl ?? 'http://127.0.0.1:18789/'}
            </code>
            <button
              type="button"
              onClick={handleCopyConsoleUrl}
              className="text-[10px] bg-white/5 hover:bg-white/10 active:bg-white/15 px-2 py-0.5 rounded border border-white/5 transition-colors font-medium cursor-pointer"
            >
              {copied ? '已复制!' : '复制'}
            </button>
          </div>
        </div>

        <div className="bg-[hsl(var(--surface-dark-soft))] border border-white/5 p-4 rounded-lg flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold text-[hsl(var(--on-dark-soft))] uppercase tracking-wider">插件启用状态</span>
          <span className="text-xs font-medium text-[hsl(var(--on-dark))] mt-1 truncate">
            {resolvedStatus?.pluginsEnabled.length ? resolvedStatus.pluginsEnabled.join(', ') : '未检测到已启用插件'}
          </span>
        </div>

        <div className="bg-[hsl(var(--surface-dark-soft))] border border-white/5 p-4 rounded-lg flex flex-col gap-1 md:col-span-2">
          <span className="text-[10px] font-semibold text-[hsl(var(--on-dark-soft))] uppercase tracking-wider">SKILLS & 工作区目录</span>
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs font-medium text-[hsl(var(--on-dark))] truncate">
              已识别 Skills: {resolvedStatus?.skillsInstalled.length ? resolvedStatus.skillsInstalled.join(', ') : '未识别'}
            </span>
            <code className="text-[11px] font-mono text-[hsl(var(--on-dark-soft))] truncate break-all mt-0.5">
              {resolvedStatus?.workspaceDir ?? result.openclawDir}
            </code>
          </div>
        </div>
      </div>

      <div className="bg-[hsl(var(--surface-dark-soft))] border border-white/5 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-[hsl(var(--on-dark-soft))] flex flex-col gap-1 select-text h-48 overflow-y-auto">
        <div className="text-white/40">$ openclaw daemon --config=openclaw.json</div>
        {hasRuntimeSession ? (
          <>
            <div>[daemon] Spawning OpenClaw core instance...</div>
            <div className={isRunning ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--primary))]'}>
              [{isRunning ? 'success' : 'startup'}] Process {runtimePid ? `started with PID: ${runtimePid}` : 'is initializing'}
            </div>
            {logTail && logTail.lines.length > 0 ? (
              logTail.lines.map((line, index) => (
                <AnsiLogLine key={`${index}-${line.slice(0, 16)}`} line={line} className="text-white/80" />
              ))
            ) : (
              <>
                <div>[gateway] Server listening at: http://127.0.0.1:18789</div>
                <div>[gateway] Control Panel ready, proxy route enabled.</div>
                <div>[openclaw] Starting pipeline runtime loops...</div>
                <div>[openclaw] API Client initialized for provider: {resolvedStatus?.providerId ?? 'default-provider'}</div>
                <div>[openclaw] Listening for incoming browser agent session requests...</div>
              </>
            )}
          </>
        ) : (
          <>
            <div>[system] Engine environment ready.</div>
            <div>[system] Config validation: OK</div>
            <div className="text-[hsl(var(--warning))]">[idle] Service instance is offline. Click &quot;启动 OpenClaw&quot; below.</div>
          </>
        )}
        <div ref={terminalEndRef} />
        <div className="flex items-center gap-1">
          <span>_</span>
          {(launchPending || (hasRuntimeSession && !logTail)) && <SpinnerIcon size={12} className="spinning text-[hsl(var(--primary))]" />}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-[hsl(var(--error)/0.2)] bg-[hsl(var(--error)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-t border-white/5 pt-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={postInstallActionLoading || !status || isStarting}
            onClick={() => {
              if (isRunning) {
                void onRestartRuntime(result.configPath, runtimePid);
                return;
              }

              void onLaunchRuntime(result.configPath);
            }}
            className="flex-1 min-w-[130px] bg-[hsl(var(--surface-dark-elevated))] hover:bg-white/10 text-[hsl(var(--on-dark))] border border-white/5 h-10 transition-colors"
          >
            {launchPending || runtimeRestartLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-2" />
                {isRunning ? '正在重启' : '正在启动'}
              </>
            ) : isRunning ? (
              <>
                <PlayIcon size={12} className="mr-2 text-[hsl(var(--success))]" />
                重新启动 OpenClaw
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
            disabled={postInstallActionLoading || !status || !isRunning || !runtimePid}
            onClick={() => runtimePid ? void onStopRuntime(result.configPath, runtimePid) : undefined}
            className="flex-1 min-w-[130px] bg-[hsl(var(--surface-dark-elevated))] hover:bg-white/10 text-[hsl(var(--on-dark))] border border-white/5 h-10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            {runtimeStopLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-2" />
                正在停止
              </>
            ) : (
              '停止 OpenClaw'
            )}
          </Button>

          <Button
            variant="secondary"
            disabled={postInstallActionLoading || !status || !onOpenControlPanel || !panelReachable}
            onClick={() => void onOpenControlPanel?.(result.configPath)}
            className="flex-1 min-w-[130px] bg-[hsl(var(--surface-dark-elevated))] hover:bg-white/10 text-[hsl(var(--on-dark))] border border-white/5 h-10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            {controlPanelOpening ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-2" />
                正在打开
              </>
            ) : (
              <>
                <EyeIcon size={14} className="mr-2" />
                打开控制面板
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            disabled={!onOpenInstallationDirectory || installationDirOpening}
            onClick={() => void onOpenInstallationDirectory?.(result.openclawDir)}
            className="bg-transparent hover:bg-white/5 text-[hsl(var(--on-dark-soft))] hover:text-[hsl(var(--on-dark))] border border-white/5 h-9 transition-colors text-xs"
          >
            {installationDirOpening ? (
              <>
                <SpinnerIcon size={12} className="spinning mr-1.5" />
                打开中
              </>
            ) : (
              <>
                <FolderIcon size={12} className="mr-1.5" />
                主程序目录
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            disabled={!onOpenLogsDirectory || logsDirOpening}
            onClick={() => void handleOpenLogsDirectory()}
            className="bg-transparent hover:bg-white/5 text-[hsl(var(--on-dark-soft))] hover:text-[hsl(var(--on-dark))] border border-white/5 h-9 transition-colors text-xs"
          >
            {logsDirOpening ? (
              <>
                <SpinnerIcon size={12} className="spinning mr-1.5" />
                打开中
              </>
            ) : (
              <>
                <ChevronRightIcon size={12} className="mr-1.5" />
                日志目录
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
