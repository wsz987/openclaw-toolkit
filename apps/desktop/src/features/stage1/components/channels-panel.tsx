import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Download, MessageSquare, Package, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { useFeishuChannelForm } from '../hooks/use-feishu-channel-form';
import {
  buildFeishuChannelSetupPayload,
  FEISHU_PLUGIN_PACKAGE,
  findInstalledFeishuPlugin
} from '../model/feishu-channel';
import type {
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawPluginInstallPayload,
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  PluginInstallLogEntry,
  Stage1InstallResult
} from '../model/types';
import { FeishuChannelForm } from './feishu-channel-form';
import { FeishuChannelReadonlyView } from './feishu-channel-readonly-view';
import { FeishuPluginInstallDialog } from './feishu-plugin-install-dialog';

type ChannelsPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  pluginInstallLoading: boolean;
  pluginInstallResult: OpenClawPluginInstallResult | null;
  pluginInstallLogs: PluginInstallLogEntry[];
  onFeishuChannelSetup: (input: OpenClawFeishuChannelSetupPayload) => Promise<OpenClawFeishuChannelSetupResult | null>;
  onInstallPlugin: (input: OpenClawPluginInstallPayload) => Promise<OpenClawPluginInstallResult | null>;
};

export function ChannelsPanel({
  result,
  status,
  statusLoading,
  feishuSetupLoading,
  feishuSetupResult,
  pluginInstallLoading,
  pluginInstallResult,
  pluginInstallLogs,
  onFeishuChannelSetup,
  onInstallPlugin
}: ChannelsPanelProps) {
  const feishu = status?.feishuChannel ?? null;
  const installedFeishuPlugin = findInstalledFeishuPlugin(status?.installedPlugins);
  const feishuPluginInstalled = Boolean(installedFeishuPlugin);
  const postInstallActionLoading = statusLoading || feishuSetupLoading || pluginInstallLoading;
  const { form, reset, secretVisibility, toggleSecret, updateField } = useFeishuChannelForm(feishu);

  const [isEditing, setIsEditing] = useState(!feishu?.configured);
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false);
  const [pendingSetupPayload, setPendingSetupPayload] = useState<OpenClawFeishuChannelSetupPayload | null>(null);

  useEffect(() => {
    if (feishu) {
      setIsEditing(!feishu.configured);
    }
  }, [feishu?.configured]);

  async function runFeishuChannelSetup(payload: OpenClawFeishuChannelSetupPayload) {
    console.info('[channels][feishu] Saving Feishu channel configuration.', {
      enabled: payload.enabled,
      connectionMode: payload.connectionMode,
      defaultAccount: payload.defaultAccount
    });
    await onFeishuChannelSetup(payload);
  }

  async function handleSaveFeishuChannel() {
    const payload = buildFeishuChannelSetupPayload(result.configPath, form);
    if (payload.enabled && !feishuPluginInstalled) {
      console.warn('[channels][feishu] Feishu plugin missing. Prompting for installation before enabling channel.');
      setPendingSetupPayload(payload);
      setPluginDialogOpen(true);
      return;
    }

    await runFeishuChannelSetup(payload);
  }

  async function handleInstallPlugin() {
    console.info('[channels][plugin-install] Installing Feishu plugin from offline artifact.');
    const installResult = await onInstallPlugin({
      configPath: result.configPath,
      pluginId: 'feishu'
    });

    if (!installResult) {
      return;
    }

    if (pendingSetupPayload) {
      const payload = pendingSetupPayload;
      setPendingSetupPayload(null);
      setPluginDialogOpen(false);
      await runFeishuChannelSetup(payload);
      return;
    }

    setPluginDialogOpen(false);
  }

  function handlePluginDialogChange(open: boolean) {
    if (!pluginInstallLoading) {
      setPluginDialogOpen(open);
    }
    if (!open && !pluginInstallLoading) {
      setPendingSetupPayload(null);
    }
  }

  function handleCancelEdit() {
    reset();
    setIsEditing(false);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col animate-fade-in">
      <ScrollArea className="mr-[-1rem] flex-1 pr-4">
        <div className="flex flex-col gap-6 pb-6">
          <ChannelsHeader
            configured={Boolean(feishu?.configured)}
            enabled={Boolean(feishu?.enabled)}
            pluginInstalled={feishuPluginInstalled}
            pluginVersion={installedFeishuPlugin?.version}
            statusLoading={statusLoading}
          />

          <PluginInstallStatusSection
            currentPluginId={installedFeishuPlugin?.id}
            currentPluginVersion={installedFeishuPlugin?.version}
            loading={postInstallActionLoading}
            pluginInstalled={feishuPluginInstalled}
            pluginInstallLoading={pluginInstallLoading}
            pluginInstallLogs={pluginInstallLogs}
            statusLoading={statusLoading}
            onInstallClick={() => {
              console.info('[channels][plugin-install] Manual install action triggered from channels panel.');
              setPendingSetupPayload(null);
              setPluginDialogOpen(true);
            }}
          />

          {!isEditing && feishu?.configured ? (
            <FeishuChannelReadonlyView feishu={feishu} />
          ) : (
            <FeishuChannelForm
              form={form}
              status={feishu}
              loading={postInstallActionLoading}
              secretVisibility={secretVisibility}
              onFieldChange={updateField}
              onToggleSecret={toggleSecret}
            />
          )}

          {feishuSetupResult ? <SetupSuccessBanner result={feishuSetupResult} /> : null}
          {pluginInstallResult ? <PluginInstallSuccessBanner result={pluginInstallResult} /> : null}
        </div>
      </ScrollArea>

      <FeishuPluginInstallDialog
        open={pluginDialogOpen}
        loading={pluginInstallLoading}
        installDir={result.openclawDir}
        onOpenChange={handlePluginDialogChange}
        onConfirm={() => void handleInstallPlugin()}
      />

      <div className="relative z-10 mt-2 flex-none border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] pt-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        {!isEditing && feishu?.configured ? (
          <Button
            variant="secondary"
            onClick={() => setIsEditing(true)}
            disabled={postInstallActionLoading}
            className="h-11 w-full cursor-pointer border-[hsl(var(--hairline))] font-medium hover:bg-[hsl(var(--surface-cream-strong))]"
          >
            <Settings2 className="mr-2 h-4 w-4" />
            修改通道接入配置
          </Button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted))]">
              {feishu?.configured ? (
                <>
                  <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                  已存在旧配置，您可以进行二次调整。
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                  尚未配置有效的飞书接入凭据。
                </>
              )}
            </div>

            <div className="flex flex-1 gap-3 sm:flex-initial sm:justify-end">
              {feishu?.configured ? (
                <Button
                  variant="secondary"
                  disabled={postInstallActionLoading}
                  onClick={handleCancelEdit}
                  className="h-10 cursor-pointer px-5 font-medium hover:bg-[hsl(var(--surface-soft))]"
                >
                  取消
                </Button>
              ) : null}

              <Button
                variant="default"
                disabled={postInstallActionLoading || (form.enabled && !form.appId.trim())}
                onClick={() => void handleSaveFeishuChannel()}
                className="h-10 min-w-[160px] flex-1 cursor-pointer bg-[hsl(var(--primary))] font-medium text-[hsl(var(--on-primary))] shadow-sm hover:bg-[hsl(var(--primary-active))] sm:flex-none"
              >
                {feishuSetupLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    正在保存通道配置...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    保存并应用配置
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelsHeader({
  configured,
  enabled,
  pluginInstalled,
  pluginVersion,
  statusLoading
}: {
  configured: boolean;
  enabled: boolean;
  pluginInstalled: boolean;
  pluginVersion?: string;
  statusLoading: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-5 md:flex-row md:items-center">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-2xl font-normal tracking-tight text-[hsl(var(--ink))]">
          <MessageSquare className="h-5 w-5 text-[hsl(var(--primary))]" />
          通讯通道与客户端 (Channels)
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[hsl(var(--muted))]">
          支持配置内置的飞书/Lark渠道。开启后，支持将 OpenClaw 对接至飞书私聊或群聊会话中。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          tone={enabled ? 'success' : 'warning'}
          label={statusLoading ? '状态加载中' : enabled ? 'Feishu 已启用' : 'Feishu 未启用'}
          withDot
        />
        {configured ? <StatusPill tone="primary" label="已配置凭据" /> : null}
        <StatusPill
          tone={pluginInstalled ? 'success' : 'warning'}
          icon={<Package className="h-3.5 w-3.5" />}
          label={pluginInstalled ? `插件已安装${pluginVersion ? ` v${pluginVersion}` : ''}` : '插件未安装'}
        />
      </div>
    </div>
  );
}

function PluginInstallStatusSection({
  currentPluginId,
  currentPluginVersion,
  loading,
  pluginInstalled,
  pluginInstallLoading,
  pluginInstallLogs,
  statusLoading,
  onInstallClick
}: {
  currentPluginId?: string;
  currentPluginVersion?: string;
  loading: boolean;
  pluginInstalled: boolean;
  pluginInstallLoading: boolean;
  pluginInstallLogs: PluginInstallLogEntry[];
  statusLoading: boolean;
  onInstallClick: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card className="border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.45]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Download className="h-4 w-4 text-[hsl(var(--primary))]" />
            飞书插件安装状态
          </CardTitle>
          <CardDescription>启用聊天渠道前会先校验插件是否已安装。安装过程使用内置压缩包，并通过国内 npm 镜像补齐依赖。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoTile label="插件包" value={FEISHU_PLUGIN_PACKAGE} mono />
            <InfoTile
              label="安装检测"
              value={statusLoading ? '状态检查中...' : pluginInstalled ? '已识别到离线插件安装记录' : '尚未检测到插件安装记录'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant={pluginInstalled ? 'secondary' : 'default'} disabled={loading} onClick={onInstallClick} className="min-w-[180px]">
              {pluginInstallLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  正在安装插件...
                </>
              ) : pluginInstalled ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新安装飞书插件
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  安装飞书插件
                </>
              )}
            </Button>

            <span className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
              {pluginInstalled
                ? `当前记录：${currentPluginId ?? 'feishu'}${currentPluginVersion ? ` @ ${currentPluginVersion}` : ''}`
                : '如果未安装，保存启用飞书渠道时会先弹出安装确认。'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-[hsl(var(--primary))]" />
            插件安装日志
          </CardTitle>
          <CardDescription>这里展示前端触发的飞书插件安装流程日志，同时也会写入浏览器控制台。</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="min-h-[180px] max-h-[220px] overflow-y-auto rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-dark))] px-4 py-3 font-mono text-[11px] leading-5">
            {pluginInstallLogs.length > 0 ? (
              pluginInstallLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.level === 'error'
                      ? 'text-[hsl(var(--warning))]'
                      : entry.level === 'success'
                        ? 'text-[hsl(var(--success))]'
                        : 'text-[hsl(var(--on-dark-soft))]'
                  }
                >
                  [{new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}] {entry.message}
                </div>
              ))
            ) : (
              <div className="text-[hsl(var(--on-dark-soft))]">
                [idle] 尚未触发飞书插件安装。点击“安装飞书插件”或在启用渠道时自动触发。
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SetupSuccessBanner({ result }: { result: OpenClawFeishuChannelSetupResult }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs animate-fade-in">
      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
      <div>
        <strong>Feishu 通道配置写入成功！</strong>
        <span>
          当前服务账号为 `{result.defaultAccount}`，模式 `{result.connectionMode}`。您可以在运行控制中心重启 OpenClaw 服务以更新底层通道进程。
        </span>
      </div>
    </div>
  );
}

function PluginInstallSuccessBanner({ result }: { result: OpenClawPluginInstallResult }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.05)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs animate-fade-in">
      <Download className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
      <div>
        <strong>飞书插件安装成功。</strong>
        <span>
          已安装 `{result.package}` 版本 `{result.version}`，插件入口 `{result.pluginEntryId}`。如当前服务正在运行，建议回到运行控制中心执行一次重启。
        </span>
      </div>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  tone,
  withDot = false
}: {
  icon?: ReactNode;
  label: string;
  tone: 'primary' | 'success' | 'warning';
  withDot?: boolean;
}) {
  const toneClassName =
    tone === 'success'
      ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]'
      : tone === 'warning'
        ? 'border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]'
        : 'border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]';
  const dotClassName =
    tone === 'success'
      ? 'bg-[hsl(var(--success))]'
      : tone === 'warning'
        ? 'bg-[hsl(var(--warning))]'
        : 'bg-[hsl(var(--primary))]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide shadow-2xs ${toneClassName}`}>
      {withDot ? <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} /> : null}
      {icon}
      {label}
    </span>
  );
}

function InfoTile({
  label,
  mono = false,
  value
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">{label}</div>
      <div className={`mt-1 text-xs text-[hsl(var(--body-strong))] ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
