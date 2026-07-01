import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, ExternalLink, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { ScrollArea } from '../../../../../components/ui/scroll-area';
import { createFeishuAuthQr, inspectFeishuAuthQrStatus, openExternalUrl } from '../../../api/stage1-api';
import { FeishuAuthQrDialog } from './feishu-auth-qr-dialog';
import { FeishuChannelForm } from './feishu-channel-form';
import { FeishuDocLinksCard } from './feishu-doc-links-card';
import { FeishuHelpDialog } from './feishu-help-dialog';
import { FEISHU_PERMISSION_TROUBLESHOOTING, getFeishuConsoleLinks } from '../model/feishu-docs';
import { buildFeishuChannelSetupPayload, createFeishuChannelFormState } from '../model/feishu-channel';
import type { FeishuAuthQrResult } from '../../../model/types';
import type {
  OpenClawFeishuChannelSetupResult,
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  OpenClawInstallResult
} from '../../../model/types';

type SecretVisibilityState = {
  appSecret: boolean;
  verificationToken: boolean;
  encryptKey: boolean;
};

export type FeishuPluginPanelProps = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  pluginInstallResult?: OpenClawPluginInstallResult | null;
  onFeishuChannelSetup: (
    input: ReturnType<typeof buildFeishuChannelSetupPayload>
  ) => Promise<OpenClawFeishuChannelSetupResult | null>;
  hideInternalEnableToggle?: boolean;
  forceEnabled?: boolean;
  onForceEnabledHandled?: () => void;
};

export function FeishuPluginPanel({
  result,
  status,
  statusLoading,
  feishuSetupLoading,
  feishuSetupResult,
  pluginInstallResult = null,
  onFeishuChannelSetup,
  hideInternalEnableToggle = false,
  forceEnabled = false,
  onForceEnabledHandled
}: FeishuPluginPanelProps) {
  const feishu = status?.feishuChannel ?? null;
  const [form, setForm] = useState(() => createFeishuChannelFormState(feishu));
  const [secretVisibility, setSecretVisibility] = useState<SecretVisibilityState>({
    appSecret: false,
    verificationToken: false,
    encryptKey: false
  });
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [authQrDialogOpen, setAuthQrDialogOpen] = useState(false);
  const [authQrLoading, setAuthQrLoading] = useState(false);
  const [authQrError, setAuthQrError] = useState<string | null>(null);
  const [authQrResult, setAuthQrResult] = useState<FeishuAuthQrResult | null>(null);
  const authQrPollingLockRef = useRef(false);
  const authQrPollingFinishedRef = useRef(false);
  const resolvedLinks = getFeishuConsoleLinks(form.appId, form.domain);
  const effectiveEnabled = hideInternalEnableToggle ? true : form.enabled;
  const postInstallActionLoading = statusLoading || feishuSetupLoading;
  const showPostInstallGuide = Boolean(pluginInstallResult && pluginInstallResult.pluginId === 'feishu' && !feishu?.configured);
  const canSaveConfiguration = !effectiveEnabled || (form.appId.trim().length > 0 && form.appSecret.trim().length > 0);
  const credentialAssistant = (
    <div className="animate-fade-in rounded-xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-4 shadow-2xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <strong className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
            <Shield className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
            飞书凭证与插件授权配置助手
          </strong>
          <p className="max-w-[560px] text-[10px] leading-relaxed text-[hsl(var(--muted))]">
            在「飞书开放平台」自建应用的「凭证与基础信息」中获取 App ID 和 App Secret。为防止调用权限不足，请在填写完成后在此生成授权二维码进行增量授权。
          </p>
          <div className="flex flex-wrap gap-2 pt-1.5">
            <Button
              type="button"
              variant="secondary"
              className="h-7 border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-2.5 text-[10px] font-medium hover:bg-[hsl(var(--surface-soft))]"
              onClick={() => void handleOpenUrl(resolvedLinks.credentials)}
            >
              <ExternalLink className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
              直达飞书凭证配置页
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-7 border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-2.5 text-[10px] font-medium hover:bg-[hsl(var(--surface-soft))]"
              onClick={() => void handleOpenUrl(resolvedLinks.docs)}
            >
              <BookOpen className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
              查看官方接入指引
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="default"
          onClick={() => void handleGenerateAuthQr()}
          className="flex h-9 w-full shrink-0 items-center justify-center px-4 text-[11px] font-semibold md:w-auto"
        >
          插件扫码授权
        </Button>
      </div>
    </div>
  );

  async function handleOpenUrl(url: string) {
    try {
      await openExternalUrl({ url });
    } catch (error) {
      console.error('[飞书文档] 打开链接失败', error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => setCopiedText(null), 2000);
  }

  function resetFormToCurrentStatus() {
    setForm(createFeishuChannelFormState(feishu));
    setSecretVisibility({
      appSecret: false,
      verificationToken: false,
      encryptKey: false
    });
  }

  function handleFieldChange<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleToggleSecret(name: keyof SecretVisibilityState) {
    setSecretVisibility((current) => ({
      ...current,
      [name]: !current[name]
    }));
  }

  async function handleGenerateAuthQr() {
    const currentAppId = form.appId.trim() || feishu?.appId?.trim() || '';
    const currentSecret = form.appSecret.trim();

    if (!currentAppId) {
      setAuthQrError('请先填写 App ID 和 App Secret，再生成二维码。');
      setAuthQrDialogOpen(true);
      return;
    }

    if (!currentSecret) {
      setAuthQrError('出于安全原因，生成二维码时需要本次输入 App Secret。请先在表单中填写 App Secret。');
      setAuthQrDialogOpen(true);
      return;
    }

    setAuthQrDialogOpen(true);
    setAuthQrLoading(true);
    setAuthQrError(null);
    authQrPollingLockRef.current = false;
    authQrPollingFinishedRef.current = false;

    try {
      const response = await createFeishuAuthQr({
        appId: currentAppId,
        appSecret: currentSecret,
        domain: form.domain
      });
      setAuthQrResult(response);
    } catch (error) {
      setAuthQrResult(null);
      setAuthQrError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthQrLoading(false);
    }
  }

  useEffect(() => {
    setForm(createFeishuChannelFormState(feishu));
  }, [feishu]);

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

  useEffect(() => {
    if (!authQrDialogOpen || !authQrResult?.deviceCode) {
      return;
    }

    const currentAppId = form.appId.trim() || feishu?.appId?.trim() || '';
    const currentSecret = form.appSecret.trim();
    if (!currentAppId || !currentSecret) {
      return;
    }

    let disposed = false;
    const intervalMs = Math.max((authQrResult.interval || 5) * 1000, 3000);

    const poll = async () => {
      if (disposed || authQrPollingLockRef.current || authQrPollingFinishedRef.current) {
        return;
      }

      authQrPollingLockRef.current = true;
      try {
        const qrStatus = await inspectFeishuAuthQrStatus({
          appId: currentAppId,
          appSecret: currentSecret,
          domain: form.domain,
          deviceCode: authQrResult.deviceCode
        });

        if (disposed) {
          return;
        }

        if (qrStatus.status === 'authorized') {
          authQrPollingFinishedRef.current = true;
          setAuthQrDialogOpen(false);
          toast.success('飞书插件扫码授权已完成。');
          return;
        }

        if (qrStatus.status === 'expired') {
          authQrPollingFinishedRef.current = true;
          return;
        }
      } finally {
        authQrPollingLockRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      authQrPollingLockRef.current = false;
    };
  }, [authQrDialogOpen, authQrResult?.deviceCode, authQrResult?.interval, feishu?.appId, form.appId, form.appSecret, form.domain]);

  useEffect(() => {
    if (!authQrDialogOpen) {
      authQrPollingLockRef.current = false;
      authQrPollingFinishedRef.current = false;
    }
  }, [authQrDialogOpen]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 animate-fade-in flex-col">
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="flex flex-col gap-6 pb-6">
          {showPostInstallGuide ? (
            <div className="animate-fade-in rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] px-5 py-4 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
                <div className="flex flex-col gap-2">
                  <strong>飞书插件已经注册完成，下一步配置机器人接入信息。</strong>
                  <span>当前安装阶段只负责把 `{pluginInstallResult?.pluginEntryId}` 注册到 OpenClaw，不再执行交互式 onboarding。</span>
                  <div className="grid gap-1 text-[11px] text-[hsl(var(--body))]">
                    <span>1. 在下方填写飞书自建应用的 `App ID` 和 `App Secret`。</span>
                    <span>2. 按需选择 `WebSocket` 或 `Webhook` 连接方式并保存配置。</span>
                    <span>3. 使用“插件扫码授权”完成应用 owner 的增量授权。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-6">
            <FeishuChannelForm
              form={{
                ...form,
                enabled: effectiveEnabled
              }}
              status={feishu}
              loading={postInstallActionLoading}
              hideEnableToggle={hideInternalEnableToggle}
              credentialAssistant={credentialAssistant}
              secretVisibility={secretVisibility}
              onFieldChange={handleFieldChange}
              onToggleSecret={handleToggleSecret}
            />

            <FeishuDocLinksCard
              appId={form.appId}
              domain={form.domain}
              activeStep={null}
              onOpenUrl={handleOpenUrl}
              onOpenFaq={() => setHelpDialogOpen(true)}
            />
          </div>

          {feishuSetupResult ? (
            <div className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
              <div>
                <strong>Feishu 通道配置写入成功！</strong>
                <span> 当前模式 `{feishuSetupResult.connectionMode}` 已写入。您可以在运行控制中心重启 OpenClaw 服务以更新底层通道进程。</span>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="relative z-10 mt-2 flex-none border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] pt-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted))]">
            {feishu?.configured ? (
              <>
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                已存在旧配置，您可以直接继续调整。
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                尚未配置有效的飞书接入凭据。
              </>
            )}
          </div>

          <div className="flex flex-1 gap-3 sm:flex-initial sm:justify-end">
            <Button
              variant="secondary"
              disabled={postInstallActionLoading}
              onClick={resetFormToCurrentStatus}
              className="h-10 cursor-pointer px-5 font-medium hover:bg-[hsl(var(--surface-soft))]"
            >
              重置
            </Button>

            <Button
              variant="default"
              disabled={postInstallActionLoading || !canSaveConfiguration}
              onClick={() =>
                void onFeishuChannelSetup(
                  buildFeishuChannelSetupPayload(result.configPath, {
                    ...form,
                    enabled: effectiveEnabled
                  })
                )
              }
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
      </div>

      <FeishuHelpDialog
        open={helpDialogOpen}
        copied={copiedText === FEISHU_PERMISSION_TROUBLESHOOTING.copyText}
        onOpenChange={setHelpDialogOpen}
        onCopy={() => copyToClipboard(FEISHU_PERMISSION_TROUBLESHOOTING.copyText)}
        onOpenPermissions={() => void handleOpenUrl(resolvedLinks.permissions)}
      />

      <FeishuAuthQrDialog
        open={authQrDialogOpen}
        loading={authQrLoading}
        error={authQrError}
        result={authQrResult}
        copiedValue={copiedText}
        onOpenChange={setAuthQrDialogOpen}
        onGenerate={() => void handleGenerateAuthQr()}
        onCopy={copyToClipboard}
        onOpenLink={(url) => void handleOpenUrl(url)}
      />
    </div>
  );
}
