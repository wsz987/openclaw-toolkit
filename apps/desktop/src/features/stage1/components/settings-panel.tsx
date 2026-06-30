import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Progress } from '../../../components/ui/progress';
import { SpinnerIcon } from '../../../components/icons';
import type { DesktopUpdateStatus, DesktopVersionInfo } from '../hooks/use-desktop-updater';
import type { Update } from '@tauri-apps/plugin-updater';

type SettingsPanelProps = {
  versionInfo: DesktopVersionInfo | null;
  status: DesktopUpdateStatus;
  availableUpdate: Update | null;
  downloadProgress: number;
  lastCheckedAt: string | null;
  error: string | null;
  onCheckUpdate: () => Promise<unknown>;
  onInstallUpdate: () => Promise<unknown>;
};

const statusText: Record<DesktopUpdateStatus, string> = {
  idle: '等待检查',
  checking: '正在检查',
  available: '发现新版本',
  'not-available': '已是最新',
  downloading: '正在下载并安装',
  ready: '准备重启',
  error: '检查失败'
};

export function SettingsPanel({
  versionInfo,
  status,
  availableUpdate,
  downloadProgress,
  lastCheckedAt,
  error,
  onCheckUpdate,
  onInstallUpdate
}: SettingsPanelProps) {
  const checking = status === 'checking';
  const installing = status === 'downloading';
  const updateVersion = availableUpdate?.version ?? null;
  const updateNotes = availableUpdate?.body ?? null;

  return (
    <div className="w-full max-w-3xl py-8 flex flex-col gap-5 animate-fade-in">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
          <ShieldCheck size={16} />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Settings</span>
        </div>
        <h2 className="font-serif text-3xl font-normal tracking-tight text-[hsl(var(--ink))]">设置</h2>
      </header>

      <section className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">版本信息</h3>
            <p className="text-xs text-[hsl(var(--muted))]">
              当前桌面端版本与更新检查状态。
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={checking || installing}
            onClick={() => void onCheckUpdate()}
            className="gap-2"
          >
            {checking ? <SpinnerIcon size={14} className="spinning" /> : <RefreshCw size={14} />}
            检查更新
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VersionItem label="应用名称" value={versionInfo?.appName ?? 'OpenClaw Toolkit'} />
          <VersionItem label="桌面端版本" value={versionInfo?.appVersion ? `v${versionInfo.appVersion}` : '-'} />
          <VersionItem label="Tauri 版本" value={versionInfo?.tauriVersion ?? '-'} />
        </div>
      </section>

      <section className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">更新状态</h3>
            <p className="text-xs text-[hsl(var(--muted))]">
              {statusText[status]}
              {lastCheckedAt ? ` · 上次检查 ${new Date(lastCheckedAt).toLocaleString()}` : ''}
            </p>
          </div>
          {availableUpdate ? (
            <span className="rounded-md bg-[hsl(var(--success)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--success))]">
              v{updateVersion}
            </span>
          ) : null}
        </div>

        {availableUpdate ? (
          <div className="mt-4 flex flex-col gap-4 rounded-md border border-[hsl(var(--hairline-soft))] bg-[hsl(var(--surface-soft))] p-4">
            <div className="flex flex-col gap-1">
              <strong className="text-sm text-[hsl(var(--ink))]">可更新到 v{updateVersion}</strong>
              {updateNotes ? (
                <p className="whitespace-pre-wrap text-xs leading-5 text-[hsl(var(--body))]">{updateNotes}</p>
              ) : (
                <p className="text-xs text-[hsl(var(--muted))]">服务器未提供发布说明。</p>
              )}
            </div>
            {installing ? (
              <div className="flex flex-col gap-2">
                <Progress value={downloadProgress} />
                <span className="text-[11px] text-[hsl(var(--muted))]">下载进度 {downloadProgress}%</span>
              </div>
            ) : null}
            <Button
              type="button"
              disabled={installing}
              onClick={() => void onInstallUpdate()}
              className="w-fit gap-2"
            >
              {installing ? <SpinnerIcon size={14} className="spinning" /> : <Download size={14} />}
              下载并安装
            </Button>
          </div>
        ) : status === 'not-available' ? (
          <p className="mt-4 text-xs text-[hsl(var(--muted))]">当前已是服务器启用的最新版本。</p>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error)/0.06)] px-3 py-2 text-xs leading-5 text-[hsl(var(--error))]">
            {error}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function VersionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 py-3">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-soft))]">
        {label}
      </span>
      <strong className="mt-1 block truncate text-sm font-semibold text-[hsl(var(--ink))]">{value}</strong>
    </div>
  );
}
