import { useEffect, useState } from 'react';
import { bootstrapAppState } from './features/stage1/api/stage1-api';
import { Stage1InstallerApp } from './features/stage1/stage1-installer-app';
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
import type { AppBootstrapState } from './features/stage1/model/types';
import { hasMissingInstallationRecord } from './features/stage1/model/app-flow';

export function AppBootstrap() {
  const [state, setState] = useState<AppBootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recoveryAlertOpen, setRecoveryAlertOpen] = useState(true);

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

  if (loading) {
    return (
      <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
        <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
          <Card className="max-w-2xl mx-auto py-14">
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))]">
                <SpinnerIcon size={22} className="spinning text-[hsl(var(--primary))]" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[hsl(var(--ink))]">正在恢复 OpenClaw 环境</h2>
                <p className="text-sm text-[hsl(var(--muted))] mt-2">
                  正在读取安装记录、验证配置和恢复上次的安装实例状态。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell flex flex-col min-h-screen py-10 px-6 bg-[hsl(var(--canvas))]">
        <div className="workspace max-w-[1200px] w-full mx-auto flex flex-col gap-8 animate-fade-in">
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
                <Button variant="secondary" onClick={() => setState(null)}>
                  进入安装向导
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const shouldReturnToInstaller = hasMissingInstallationRecord(state);

  if (shouldReturnToInstaller) {
    return (
      <>
        <Stage1InstallerApp
          bootstrapState={null}
          initialBaseDir={state?.settings.lastSelectedBaseDir ?? state?.activeInstallation?.baseDir ?? null}
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
              {state?.message}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction>返回安装页</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return <Stage1InstallerApp bootstrapState={state} onExitInstalledHome={() => setRefreshKey((value) => value + 1)} />;
}
