import { Download, RefreshCw, ShieldCheck, Info, AlertCircle, CheckCircle2, Cpu, Package, AppWindow } from 'lucide-react';
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
  'not-available': '无可用更新',
  downloading: '正在下载并安装',
  ready: '准备重启',
  error: '检查失败'
};

const statusTone: Record<DesktopUpdateStatus, 'idle' | 'busy' | 'success' | 'warning' | 'error'> = {
  idle: 'idle',
  checking: 'busy',
  available: 'warning',
  'not-available': 'success',
  downloading: 'busy',
  ready: 'success',
  error: 'error'
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
  const tone = statusTone[status];

  return (
    <div className="w-full h-full flex flex-col animate-fade-in py-2">
      <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] shadow-sm h-full flex flex-col font-sans overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b border-[hsl(var(--hairline-soft))] pb-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight flex items-center gap-2">
                <ShieldCheck size={20} className="text-[hsl(var(--primary))]" />
                设置
              </h2>
              <span className="text-xs text-[hsl(var(--muted))]">
                管理桌面端版本信息与更新检查
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={checking || installing}
              onClick={() => void onCheckUpdate()}
              className="gap-1.5 h-8 rounded-lg border-[hsl(var(--hairline-soft))]"
            >
              {checking ? <SpinnerIcon size={12} className="spinning" /> : <RefreshCw size={12} />}
              检查更新
            </Button>
          </div>

          {/* Version Info Section */}
          <section className="flex flex-col gap-3">
            <SectionLabel>版本信息</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <VersionItem
                icon={<AppWindow size={14} className="text-[hsl(var(--muted-soft))]" />}
                label="应用名称"
                value={versionInfo?.appName ?? 'OpenClaw Toolkit'}
              />
              <VersionItem
                icon={<Package size={14} className="text-[hsl(var(--muted-soft))]" />}
                label="桌面端版本"
                value={versionInfo?.appVersion ? `v${versionInfo.appVersion}` : '-'}
              />
              <VersionItem
                icon={<Cpu size={14} className="text-[hsl(var(--muted-soft))]" />}
                label="Tauri 版本"
                value={versionInfo?.tauriVersion ?? '-'}
              />
            </div>
          </section>

          {/* Update Status Section */}
          <section className="flex flex-col gap-3">
            <SectionLabel>更新状态</SectionLabel>
            <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.4] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <StatusDot tone={tone} busy={checking || installing} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-[hsl(var(--ink))]">
                      {statusText[status]}
                    </span>
                    <span className="text-[11px] text-[hsl(var(--muted))] truncate">
                      {lastCheckedAt ? `上次检查 ${new Date(lastCheckedAt).toLocaleString()}` : '尚未执行检查'}
                    </span>
                  </div>
                </div>
                {availableUpdate ? (
                  <span className="flex-shrink-0 rounded-md bg-[hsl(var(--success)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--success))]">
                    v{updateVersion}
                  </span>
                ) : null}
              </div>

              {/* Not available hint */}
              {status === 'not-available' && !availableUpdate ? (
                <div className="flex items-start gap-2.5 rounded-md border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.05)] px-3 py-2.5 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
                  <CheckCircle2 size={14} className="text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
                  <span>当前已是最新版本，无可用更新。</span>
                </div>
              ) : null}

              {/* Available update detail */}
              {availableUpdate ? (
                <div className="flex flex-col gap-3 rounded-md border border-[hsl(var(--hairline-soft))] bg-[hsl(var(--canvas))] p-4">
                  <div className="flex flex-col gap-1">
                    <strong className="text-sm text-[hsl(var(--ink))]">可更新到 v{updateVersion}</strong>
                    {updateNotes ? (
                      <p className="whitespace-pre-wrap text-xs leading-5 text-[hsl(var(--body))]">{updateNotes}</p>
                    ) : (
                      <p className="text-xs text-[hsl(var(--muted))]">服务器未提供发布说明。</p>
                    )}
                  </div>
                  {installing ? (
                    <div className="flex flex-col gap-1.5">
                      <Progress value={downloadProgress} />
                      <span className="text-[11px] text-[hsl(var(--muted))]">下载进度 {downloadProgress}%</span>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    disabled={installing}
                    onClick={() => void onInstallUpdate()}
                    className="w-fit gap-1.5 h-8 text-xs rounded-lg"
                  >
                    {installing ? <SpinnerIcon size={13} className="spinning" /> : <Download size={13} />}
                    下载并安装
                  </Button>
                </div>
              ) : null}

              {/* Error */}
              {error ? (
                <div className="flex items-start gap-2.5 rounded-md border border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error)/0.06)] px-3 py-2.5 text-xs leading-5 text-[hsl(var(--error))]">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* About / help hint */}
          <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-[hsl(var(--hairline-soft))] bg-[hsl(var(--surface-soft))/0.2] px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            <Info size={14} className="text-[hsl(var(--muted-soft))] mt-0.5 flex-shrink-0" />
            <span>
              更新包由官方构建并签名，安装完成后将提示重启以应用新版本。如遇网络异常可稍后重试检查。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-soft))]">
      {children}
    </span>
  );
}

function VersionItem({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3.5 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-soft))]">
          {label}
        </span>
      </div>
      <strong className="block truncate text-sm font-semibold text-[hsl(var(--ink))]">{value}</strong>
    </div>
  );
}

function StatusDot({
  tone,
  busy
}: {
  tone: 'idle' | 'busy' | 'success' | 'warning' | 'error';
  busy?: boolean;
}) {
  const palette: Record<typeof tone, string> = {
    idle: 'bg-[hsl(var(--muted-soft))]',
    busy: 'bg-[hsl(var(--primary))]',
    success: 'bg-[hsl(var(--success))]',
    warning: 'bg-[hsl(var(--warning))]',
    error: 'bg-[hsl(var(--error))]'
  };
  const pulsing = busy || tone === 'warning' || tone === 'error';
  return (
    <span className="relative flex-shrink-0 flex items-center justify-center w-8 h-8">
      <span
        className={`absolute inset-0 rounded-full ${pulsing ? 'animate-ping [animation-duration:2.5s] opacity-30' : 'opacity-0'} ${palette[tone]}`}
      />
      <span className={`relative w-2.5 h-2.5 rounded-full ${palette[tone]} ${pulsing ? 'animate-pulse' : ''}`} />
    </span>
  );
}
