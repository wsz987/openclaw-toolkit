import { Button } from '../../../components/ui/button';
import { SpinnerIcon } from '../../../components/icons';
import type {
  OpenClawPostInstallStatus,
  OpenClawStopResult,
  Stage1InstallResult
} from '../model/types';

// Custom premium inline SVG icons
const PlayIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const StopIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
  </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const WebConsoleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const KeyIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

type ServiceControlPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  runtimeLaunchLoading: boolean;
  runtimeStopLoading: boolean;
  runtimeRestartLoading: boolean;
  onLaunchRuntime: (configPath: string) => Promise<unknown>;
  onStopRuntime: (configPath: string, pid: number) => Promise<OpenClawStopResult | null>;
  onRestartRuntime: (configPath: string, pid?: number | null) => Promise<unknown>;
  onNavigateToAdvancedConsole?: () => void;
  onNavigateToProvider?: () => void;
  onOpenControlPanel?: (configPath: string) => Promise<string | null>;
  controlPanelOpening?: boolean;
};

function StatusHeartbeat({ isRunning, isBusy }: { isRunning: boolean; isBusy: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-28 h-28 select-none">
      {/* Outer pulsing halos */}
      {isRunning && !isBusy && (
        <>
          <div className="absolute inset-0 rounded-full bg-[hsl(var(--success)/0.06)] animate-ping [animation-duration:3s]" />
          <div className="absolute -inset-3 rounded-full bg-[hsl(var(--success)/0.03)] animate-pulse [animation-duration:2.5s]" />
        </>
      )}

      {/* Outer ring */}
      <div className={`relative flex items-center justify-center w-20 h-20 rounded-full border transition-all duration-700 ${isRunning
        ? 'bg-[hsl(var(--success)/0.04)] border-[hsl(var(--success)/0.25)] shadow-[0_0_20px_rgba(93,184,114,0.12)]'
        : 'bg-[hsl(var(--muted)/0.02)] border-[hsl(var(--hairline))]'
        }`}>
        {/* Core status indicator circle */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${isBusy
          ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
          : isRunning
            ? 'bg-[hsl(var(--success))] text-[hsl(var(--on-primary))] shadow-[0_4px_14px_rgba(93,184,114,0.35)]'
            : 'bg-[hsl(var(--muted-soft))] text-[hsl(var(--on-primary))]'
          }`}>
          {isBusy ? (
            <SpinnerIcon size={18} className="spinning" />
          ) : isRunning ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServiceControlPanel({
  result,
  status,
  statusLoading,
  runtimeLaunchLoading,
  runtimeStopLoading,
  runtimeRestartLoading,
  onLaunchRuntime,
  onStopRuntime,
  onRestartRuntime,
  onNavigateToAdvancedConsole,
  onNavigateToProvider,
  onOpenControlPanel,
  controlPanelOpening = false
}: ServiceControlPanelProps) {
  const providerReady = status?.providerInitialized ?? false;
  const isStarting = status?.runtimeState === 'starting';
  const isRunning = status?.runtimeRunning ?? (status?.runtimeState === 'running');
  const pid = status?.runtimePid ?? null;
  const runtimeActionRequired = status?.runtimeActionRequired ?? 'none';
  const pendingConfigChanges = status?.pendingConfigChanges ?? [];
  const busy = runtimeLaunchLoading || runtimeStopLoading || runtimeRestartLoading || statusLoading;

  if (!providerReady) {
    return (
      <div className="max-w-md w-full mx-auto my-auto py-16 flex flex-col gap-6 items-center text-center animate-fade-in">
        <div className="relative flex items-center justify-center w-24 h-24 select-none">
          <div className="absolute inset-0 rounded-full border border-dashed border-[hsl(var(--muted)/0.25)] animate-[spin_12s_linear_infinite]" />
          <div className="w-16 h-16 rounded-full bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] flex items-center justify-center text-[hsl(var(--muted-soft))]">
            <KeyIcon className="text-[hsl(var(--muted-soft))]" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-2xl font-medium text-[hsl(var(--ink))] tracking-tight">未配置模型提供方</h2>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted))] max-w-xs mx-auto">
            在开启 OpenClaw 网关前，请先配置并完成模型提供方的 API 授权与服务接入。
          </p>
        </div>
        {onNavigateToProvider && (
          <Button
            onClick={onNavigateToProvider}
            className="h-10 px-6 text-xs bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] transition-all rounded-xl shadow-sm"
          >
            前往配置 API
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-auto py-12 px-4 flex flex-col items-center justify-center text-center gap-8 animate-fade-in">
      {/* Heartbeat Status Indicator */}
      <StatusHeartbeat isRunning={isRunning} isBusy={busy} />

      {/* Title & Status Info */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-2xl font-medium text-[hsl(var(--ink))] tracking-tight">OpenClaw Gateway</h2>

        <div className={`text-[10px] font-semibold tracking-wider flex items-center gap-1.5 uppercase ${isRunning ? 'text-[hsl(var(--success))]' : isStarting ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted))]'
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[hsl(var(--success))] animate-pulse' : isStarting ? 'bg-[hsl(var(--primary))] animate-pulse' : 'bg-[hsl(var(--muted-soft))]'
            }`} />
          {isRunning ? '服务运行中' : isStarting ? '服务启动中' : '服务已停止'}
          {(isRunning || isStarting) && pid && (
            <span className="text-[hsl(var(--muted-soft))] font-normal font-mono normal-case">
              (PID: {pid})
            </span>
          )}
        </div>
      </div>

      {/* Main Interactive Controls */}
      <div className="w-full flex flex-col items-center gap-4">
        {isRunning ? (
          onOpenControlPanel && (
            <Button
              onClick={() => void onOpenControlPanel(result.configPath)}
              disabled={controlPanelOpening || busy}
              className="w-full h-12 text-xs font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] transition-all duration-300 flex items-center justify-center gap-2 rounded-xl shadow-[0_4px_12px_rgba(204,120,92,0.25)] hover:shadow-[0_6px_20px_rgba(204,120,92,0.4)] hover:-translate-y-0.5 active:translate-y-0"
            >
              {controlPanelOpening ? (
                <>
                  <SpinnerIcon size={14} className="spinning mr-1" />
                  正在打开网页控制台...
                </>
              ) : (
                <>
                  <WebConsoleIcon className="mr-1" />
                  打开 OpenClaw 网页端
                </>
              )}
            </Button>
          )
        ) : (
          <Button
            disabled={busy}
            onClick={() => void onLaunchRuntime(result.configPath)}
            className="w-full h-12 text-xs font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] transition-all duration-300 flex items-center justify-center gap-2 rounded-xl shadow-[0_4px_12px_rgba(204,120,92,0.25)] hover:shadow-[0_6px_20px_rgba(204,120,92,0.4)] hover:-translate-y-0.5 active:translate-y-0"
          >
            {runtimeLaunchLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-1" />
                正在启动服务...
              </>
            ) : (
              <>
                <PlayIcon className="mr-1" />
                启动网关服务
              </>
            )}
          </Button>
        )}

        {/* Restart & Stop Buttons (Always in DOM to preserve height, preventing layout jumps) */}
        <div 
          className={`flex w-full gap-3 mt-1 transition-all duration-300 ease-out ${
            (isRunning || isStarting)
              ? 'opacity-100 translate-y-0 pointer-events-auto' 
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <Button
            variant="outline"
            disabled={busy || !isRunning}
            onClick={() => void onRestartRuntime(result.configPath, pid)}
            className="flex-1 h-10 text-xs font-medium border-[hsl(var(--hairline))] bg-transparent hover:bg-[hsl(var(--surface-soft))] text-[hsl(var(--body-strong))] rounded-xl transition-all duration-200"
          >
            {runtimeRestartLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-1" />
                正在重启...
              </>
            ) : (
              <>
                <RefreshIcon className="mr-1 hover:animate-[spin_4s_linear_infinite]" />
                重启服务
              </>
            )}
          </Button>

          <Button
            variant="outline"
            disabled={busy || !pid || isStarting}
            onClick={() => pid ? void onStopRuntime(result.configPath, pid) : undefined}
            className="flex-1 h-10 text-xs font-medium border-[hsl(var(--error)/0.18)] bg-transparent hover:bg-[hsl(var(--error)/0.04)] text-[hsl(var(--error))] hover:text-[hsl(var(--error))] rounded-xl transition-all duration-200"
          >
            {runtimeStopLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-1" />
                正在停止...
              </>
            ) : (
              <>
                <StopIcon className="mr-1" />
                停止服务
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Pending Config Changes Warning Banner */}
      {runtimeActionRequired !== 'none' && (
        <div className="w-full rounded-xl border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] flex items-start gap-2.5 text-left animate-slide-in">
          <span className="text-[hsl(var(--warning))] text-sm select-none font-bold mt-0.5">⚠️</span>
          <div className="flex flex-col gap-0.5">
            <strong className="font-semibold text-[hsl(var(--warning))]">待生效的配置变更：</strong>
            <span className="text-[hsl(var(--body))] text-[11px]">
              检测到配置更新，建议{runtimeActionRequired === 'reload' ? '重新加载' : '重启服务'}以应用配置。
              {pendingConfigChanges.length > 0 ? ` (变更项：${pendingConfigChanges.join('、')})` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Advanced Console Link */}
      {/* {onNavigateToAdvancedConsole && (
        <div className="flex justify-center mt-4 border-t border-[hsl(var(--hairline-soft))] w-full pt-4">
          <Button
            variant="ghost"
            onClick={onNavigateToAdvancedConsole}
            className="text-xs text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] hover:bg-transparent transition-colors px-4 py-1 gap-1"
          >
            <span>进入高级控制台 (实时日志)</span>
            <span className="text-sm font-sans font-normal">&rarr;</span>
          </Button>
        </div>
      )} */}
    </div>
  );
}
