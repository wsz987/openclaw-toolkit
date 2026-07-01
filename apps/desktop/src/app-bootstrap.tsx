import { useEffect, useState } from 'react';
import { bootstrapAppState } from './features/installer/api/installer-api';
import { OpenClawInstallerApp } from './features/installer/openclaw-installer-app';
import { DashboardApp } from './features/dashboard/dashboard-app';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './components/ui/alert-dialog';
import { SpinnerIcon } from './components/icons';
import type { AppBootstrapState } from './features/installer/model/types';
import { hasMissingInstallationRecord, isRecoveredInstallationState } from './features/installer/model/app-flow';
import { DebugFlowPanel } from './features/installer/components/debug-flow-panel';
import {
  canForceInstalledHome,
  getEffectiveBootstrapState,
  readInstallerDebugFlowState,
  writeInstallerDebugFlowState
} from './features/installer/model/debug-flow';

export function AppBootstrap() {
  const [state, setState] = useState<AppBootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recoveryAlertOpen, setRecoveryAlertOpen] = useState(true);
  const [debugFlowState, setDebugFlowState] = useState(() => readInstallerDebugFlowState());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await bootstrapAppState();
        if (!cancelled) {
          setState(response);
          setRecoveryAlertOpen(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    writeInstallerDebugFlowState(debugFlowState);
  }, [debugFlowState]);

  function handleEnterInstaller() {
    setError(null);
    setState(null);
    setLoading(false);
  }

  const isDev = import.meta.env.DEV;
  const effectiveState = getEffectiveBootstrapState(state, debugFlowState.mode);

  if (loading) {
    return (
      <main className="app-shell flex flex-col min-h-screen bg-[hsl(var(--canvas))] relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.06)_0%,transparent_70%)] pointer-events-none" />
        
        <div className="flex-1 flex flex-col items-center justify-center max-w-xl w-full mx-auto p-8 relative z-10 animate-fade-in">
          {/* Elegant concentric spinner */}
          <div className="relative w-28 h-28 flex items-center justify-center mb-8">
            <div className="absolute inset-0 rounded-full border border-[hsl(var(--primary)/0.12)] animate-ping [animation-duration:2.5s]" />
            <div className="absolute inset-4 rounded-full border border-[hsl(var(--primary)/0.08)] animate-pulse" />
            <div className="absolute inset-6 rounded-full border-2 border-[hsl(var(--hairline-soft))]" />
            <div className="absolute inset-6 rounded-full border-2 border-transparent border-t-[hsl(var(--primary))] border-r-[hsl(var(--primary))] animate-spin [animation-duration:1.2s]" />
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] flex items-center justify-center shadow-xs">
              <SpinnerIcon size={16} className="spinning text-[hsl(var(--primary))/0.8]" />
            </div>
          </div>

          {/* Typography */}
          <div className="text-center">
            <h2 className="text-2xl font-medium tracking-tight text-[hsl(var(--ink))]">
              正在恢复 OpenClaw 环境
            </h2>
            <p className="text-sm text-[hsl(var(--muted))] mt-3 leading-relaxed max-w-sm mx-auto">
              正在读取安装记录、验证配置和恢复上次的安装实例状态。
            </p>
          </div>

          {/* Micro-steps status */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-[hsl(var(--muted-soft))] select-none">
            <span className="flex items-center gap-1.5 animate-pulse font-medium text-[hsl(var(--primary))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_8px_hsl(var(--primary))]" />
              读取安装记录
            </span>
            <span className="hidden sm:inline w-1 h-px bg-[hsl(var(--hairline))]" />
            <span className="flex items-center gap-1.5 opacity-60">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-soft))]" />
              验证环境配置
            </span>
            <span className="hidden sm:inline w-1 h-px bg-[hsl(var(--hairline))]" />
            <span className="flex items-center gap-1.5 opacity-60">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-soft))]" />
              恢复运行实例
            </span>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
        <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
          {isDev ? (
            <DebugFlowPanel
              mode={debugFlowState.mode}
              canForceInstalledHome={canForceInstalledHome(state)}
              installerStep={debugFlowState.installerStep}
              onModeChange={(mode) => setDebugFlowState((current) => ({ ...current, mode }))}
              onInstallerStepChange={(installerStep) => setDebugFlowState((current) => ({ ...current, installerStep }))}
            />
          ) : null}
          <Card className="max-w-2xl mx-auto border-[hsl(var(--error)/0.3)]">
            <CardHeader>
              <CardTitle>启动恢复失败</CardTitle>
              <CardDescription>应用在读取安装状态时发生错误，可以重试或进入安装向导。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-[hsl(var(--error)/0.2)] bg-[hsl(var(--error)/0.08)] p-4 text-sm text-[hsl(var(--body-strong))] whitespace-pre-wrap break-all">
                {error}
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setRefreshKey((value) => value + 1)}>重新恢复</Button>
                <Button variant="secondary" onClick={handleEnterInstaller}>
                  进入安装向导
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const shouldReturnToInstaller =
    debugFlowState.mode !== 'installed-home' && hasMissingInstallationRecord(effectiveState);

  if (shouldReturnToInstaller) {
    return (
      <>
        {isDev ? (
          <DebugFlowPanel
            mode={debugFlowState.mode}
            canForceInstalledHome={canForceInstalledHome(state)}
            installerStep={debugFlowState.installerStep}
            onModeChange={(mode) => setDebugFlowState((current) => ({ ...current, mode }))}
            onInstallerStepChange={(installerStep) => setDebugFlowState((current) => ({ ...current, installerStep }))}
          />
        ) : null}
        <OpenClawInstallerApp
          bootstrapState={null}
          initialBaseDir={
            effectiveState?.settings.lastSelectedBaseDir ??
            effectiveState?.activeInstallation?.baseDir ??
            effectiveState?.defaultBaseDir ??
            null
          }
          initialWizardStep={debugFlowState.installerStep}
          onExitInstalledHome={() => setRefreshKey((value) => value + 1)}
        />
        <AlertDialog open={recoveryAlertOpen} onOpenChange={setRecoveryAlertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>检测到安装记录已丢失</AlertDialogTitle>
            <AlertDialogDescription>
              当前恢复到的 OpenClaw 实例缺少 `installed-manifest.json`，无法继续按已安装环境进入操作首页。
              请回到安装页面重新安装，或重新选择一个完整的已有安装目录导入。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.08)] p-4 text-sm leading-6 text-[hsl(var(--body-strong))] break-all">
              {effectiveState?.message}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction>返回安装页</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      {isDev ? (
        <DebugFlowPanel
          mode={debugFlowState.mode}
          canForceInstalledHome={canForceInstalledHome(state)}
          installerStep={debugFlowState.installerStep}
          onModeChange={(mode) => setDebugFlowState((current) => ({ ...current, mode }))}
          onInstallerStepChange={(installerStep) => setDebugFlowState((current) => ({ ...current, installerStep }))}
        />
      ) : null}
      {isRecoveredInstallationState(effectiveState) ? (
        <DashboardApp
          bootstrapState={effectiveState}
          onExitInstalledHome={() => setRefreshKey((value) => value + 1)}
        />
      ) : (
        <OpenClawInstallerApp
          bootstrapState={effectiveState}
          initialWizardStep={debugFlowState.installerStep}
          onExitInstalledHome={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </>
  );
}
