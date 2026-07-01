import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Check, ExternalLink, RefreshCw, Shield } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { ScrollArea } from '../../../../../components/ui/scroll-area';
import { openExternalUrl } from '../../../api/stage1-api';
import type {
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  OpenClawQqbotChannelSetupResult,
  OpenClawInstallResult
} from '../../../model/types';
import { buildQqbotChannelSetupPayload, createQqbotChannelFormState, resolveQqbotChannel } from '../model/qqbot-channel';
import { getQqbotConsoleLinks, QQBOT_TROUBLESHOOTING } from '../model/qqbot-docs';
import { QqbotChannelForm } from './qqbot-channel-form';
import { QqbotDocLinksCard } from './qqbot-doc-links-card';
import { QqbotHelpDialog } from './qqbot-help-dialog';

export type QqbotPluginPanelProps = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  qqbotSetupLoading: boolean;
  qqbotSetupResult: OpenClawQqbotChannelSetupResult | null;
  pluginInstallResult?: OpenClawPluginInstallResult | null;
  onQqbotChannelSetup: (
    input: ReturnType<typeof buildQqbotChannelSetupPayload>
  ) => Promise<OpenClawQqbotChannelSetupResult | null>;
  hideInternalEnableToggle?: boolean;
  forceEnabled?: boolean;
  onForceEnabledHandled?: () => void;
  loginBusy?: boolean;
};

export function QqbotPluginPanel({
  result,
  status,
  statusLoading,
  qqbotSetupLoading,
  qqbotSetupResult,
  pluginInstallResult = null,
  onQqbotChannelSetup,
  hideInternalEnableToggle = false,
  forceEnabled = false,
  onForceEnabledHandled
}: QqbotPluginPanelProps) {
  const qqbot = resolveQqbotChannel(status);
  const [form, setForm] = useState(() => createQqbotChannelFormState(qqbot));
  const [secretVisible, setSecretVisible] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const effectiveEnabled = hideInternalEnableToggle ? true : form.enabled;
  const postInstallActionLoading = statusLoading || qqbotSetupLoading;
  const canSaveConfiguration = !effectiveEnabled || (form.appId.trim().length > 0 && form.clientSecret.trim().length > 0) || Boolean(qqbot?.configured && form.appId.trim().length > 0);
  const showPostInstallGuide = Boolean(pluginInstallResult && pluginInstallResult.pluginId === 'qqbot' && !qqbot?.configured);
  const resolvedLinks = getQqbotConsoleLinks(form.appId || qqbot?.appId);

  async function handleOpenUrl(url: string) {
    try {
      await openExternalUrl({ url });
    } catch (error) {
      console.error('[QQ Bot 文档] 打开链接失败', error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => setCopiedText(null), 2000);
  }

  function handleFieldChange<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function resetFormToCurrentStatus() {
    setForm(createQqbotChannelFormState(qqbot));
    setSecretVisible(false);
  }

  useEffect(() => {
    setForm(createQqbotChannelFormState(qqbot));
  }, [qqbot]);

  useEffect(() => {
    if (!forceEnabled) {
      return;
    }
    setForm((current) => ({
      ...current,
      enabled: true
    }));
    onForceEnabledHandled?.();
  }, [forceEnabled, onForceEnabledHandled]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 animate-fade-in flex-col">
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="flex flex-col gap-6 pb-6">
          {showPostInstallGuide ? (
            <div className="animate-fade-in rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] px-5 py-4 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
                <div className="flex flex-col gap-2">
                  <strong>QQ Bot 插件已经注册完成，下一步配置机器人接入信息。</strong>
                  <span>当前安装阶段只负责把 `{pluginInstallResult?.pluginEntryId}` 注册到 OpenClaw；下一步请打开 QQ 开放平台创建机器人，再填入 AppID / AppSecret。</span>
                  <div className="grid gap-1 text-[11px] text-[hsl(var(--body))]">
                    <span>1. 点击“打开 QQ 开放平台”进入官方控制台。</span>
                    <span>2. 在 QQ 开放平台创建机器人，并复制 AppID / AppSecret。</span>
                    <span>3. 填写凭证与消息策略，保存配置后重启 OpenClaw 服务。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
              <ExternalLink className="h-4 w-4 text-[hsl(var(--primary))]" />
              QQ 开放平台配置入口
            </div>
            <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
              QQ Bot 官方插件需要 AppID / AppSecret。点击下方按钮打开 QQ 开放平台，在官方控制台登录、创建机器人并复制凭证后，再回到这里保存配置。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleOpenUrl(resolvedLinks.openPlatformHome)}
                disabled={postInstallActionLoading}
                className="h-9 text-[11px] font-semibold"
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                打开 QQ 开放平台
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleOpenUrl(resolvedLinks.officialGuide)} className="h-9 text-[11px] font-medium">
                <BookOpen className="mr-2 h-3.5 w-3.5" />
                查看图文指南
              </Button>
            </div>
          </div>

          <QqbotChannelForm
            form={{ ...form, enabled: effectiveEnabled }}
            status={qqbot}
            loading={postInstallActionLoading}
            hideEnableToggle={hideInternalEnableToggle}
            secretVisible={secretVisible}
            onFieldChange={handleFieldChange}
            onToggleSecret={() => setSecretVisible((current) => !current)}
          />

          <QqbotDocLinksCard appId={form.appId || qqbot?.appId} onOpenUrl={(url) => void handleOpenUrl(url)} onOpenFaq={() => setHelpDialogOpen(true)} />

          {qqbotSetupResult ? (
            <div className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
              <div>
                <strong>QQ Bot 通道配置写入成功！</strong>
                <span> 凭证已写入。您可以在运行控制中心重启 OpenClaw 服务以更新底层通道进程。</span>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="relative z-10 mt-2 flex-none border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] pt-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted))]">
            {qqbot?.configured ? (
              <>
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                已存在 QQ Bot 配置，您可以直接继续调整。
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                尚未配置有效的 QQ Bot 接入凭据。
              </>
            )}
          </div>

          <div className="flex flex-1 gap-3 sm:flex-initial sm:justify-end">
            <Button variant="secondary" disabled={postInstallActionLoading} onClick={resetFormToCurrentStatus} className="h-10 cursor-pointer px-5 font-medium hover:bg-[hsl(var(--surface-soft))]">
              重置
            </Button>

            <Button
              variant="default"
              disabled={postInstallActionLoading || !canSaveConfiguration}
              onClick={() =>
                void onQqbotChannelSetup(
                  buildQqbotChannelSetupPayload(result.configPath, {
                    ...form,
                    enabled: effectiveEnabled
                  })
                )
              }
              className="h-10 min-w-[160px] flex-1 cursor-pointer bg-[hsl(var(--primary))] font-medium text-[hsl(var(--on-primary))] shadow-sm hover:bg-[hsl(var(--primary-active))] sm:flex-none"
            >
              {qqbotSetupLoading ? (
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
      </div>

      <QqbotHelpDialog
        open={helpDialogOpen}
        copied={copiedText === QQBOT_TROUBLESHOOTING.copyText}
        onOpenChange={setHelpDialogOpen}
        onCopy={() => copyToClipboard(QQBOT_TROUBLESHOOTING.copyText)}
      />

    </div>
  );
}
