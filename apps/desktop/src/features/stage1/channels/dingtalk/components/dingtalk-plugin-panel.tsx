import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, ExternalLink, RefreshCw, Shield, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { ScrollArea } from '../../../../../components/ui/scroll-area';
import { createDingtalkAuthQr, inspectDingtalkAuthQrStatus, openExternalUrl } from '../../../api/stage1-api';
import { DingtalkChannelForm } from './dingtalk-channel-form';
import { DingtalkAuthQrDialog } from './dingtalk-auth-qr-dialog';
import { DingtalkDocLinksCard } from './dingtalk-doc-links-card';
import { DingtalkHelpDialog } from './dingtalk-help-dialog';
import { DINGTALK_PERMISSION_TROUBLESHOOTING, getDingtalkConsoleLinks } from '../model/dingtalk-docs';
import { buildDingtalkChannelSetupPayload, createDingtalkChannelFormState } from '../model/dingtalk-channel';
import type {
  DingtalkAuthQrResult,
  OpenClawDingtalkChannelSetupResult,
  OpenClawPluginInstallResult,
  OpenClawPostInstallStatus,
  Stage1InstallResult
} from '../../../model/types';

type SecretVisibilityState = {
  clientSecret: boolean;
};

const DINGTALK_QR_DISPLAY_TTL_SECS = 300;

export type DingtalkPluginPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  dingtalkSetupLoading: boolean;
  dingtalkSetupResult: OpenClawDingtalkChannelSetupResult | null;
  pluginInstallResult?: OpenClawPluginInstallResult | null;
  onDingtalkChannelSetup: (
    input: ReturnType<typeof buildDingtalkChannelSetupPayload>
  ) => Promise<OpenClawDingtalkChannelSetupResult | null>;
  hideInternalEnableToggle?: boolean;
  forceEnabled?: boolean;
  onForceEnabledHandled?: () => void;
};

export function DingtalkPluginPanel({
  result,
  status,
  statusLoading,
  dingtalkSetupLoading,
  dingtalkSetupResult,
  pluginInstallResult = null,
  onDingtalkChannelSetup,
  hideInternalEnableToggle = false,
  forceEnabled = false,
  onForceEnabledHandled
}: DingtalkPluginPanelProps) {
  const dingtalk = status?.dingtalkChannel ?? null;
  const [form, setForm] = useState(() => createDingtalkChannelFormState(dingtalk));
  const [secretVisibility, setSecretVisibility] = useState<SecretVisibilityState>({
    clientSecret: false
  });
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authQrLoading, setAuthQrLoading] = useState(false);
  const [authQrPolling, setAuthQrPolling] = useState(false);
  const [authQrError, setAuthQrError] = useState<string | null>(null);
  const [authStatusLabel, setAuthStatusLabel] = useState('等待钉钉扫码中');
  const [authQrResult, setAuthQrResult] = useState<DingtalkAuthQrResult | null>(null);
  const resolvedLinks = getDingtalkConsoleLinks(form.clientId);
  const effectiveEnabled = hideInternalEnableToggle ? true : form.enabled;
  const postInstallActionLoading = statusLoading || dingtalkSetupLoading;
  const showPostInstallGuide = Boolean(
    pluginInstallResult && pluginInstallResult.pluginId === 'dingtalk' && !dingtalk?.configured
  );
  const canSaveConfiguration =
    !effectiveEnabled || (form.clientId.trim().length > 0 && form.clientSecret.trim().length > 0);
  const waitingRef = useRef(false);
  const stoppedRef = useRef(false);

  const credentialAssistant = (
    <div className="animate-fade-in rounded-xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-4 shadow-2xs">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <strong className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
            <Shield className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
            钉钉凭证与机器人配置助手
          </strong>
          <p className="max-w-[560px] text-[10px] leading-relaxed text-[hsl(var(--muted))]">
            在「钉钉开发者后台」企业内部应用的「基础信息 -&gt; 应用凭证」中获取 AppKey（Client ID）与 AppSecret（Client Secret），并在「机器人」能力页将消息接收模式设置为 Stream。
          </p>
          <div className="flex flex-wrap gap-2 pt-1.5">
            <Button
              type="button"
              variant="secondary"
              className="h-7 border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-2.5 text-[10px] font-medium hover:bg-[hsl(var(--surface-soft))]"
              onClick={() => void handleOpenUrl(resolvedLinks.credentials)}
            >
              <ExternalLink className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
              直达钉钉应用凭证页
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
      </div>
    </div>
  );

  async function handleOpenUrl(url: string) {
    try {
      await openExternalUrl({ url });
    } catch (error) {
      console.error('[钉钉文档] 打开链接失败', error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => setCopiedText(null), 2000);
  }

  function resetFormToCurrentStatus() {
    setForm(createDingtalkChannelFormState(dingtalk));
    setSecretVisibility({ clientSecret: false });
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

  async function beginQrAuthorization() {
    setAuthDialogOpen(true);
    setAuthQrLoading(true);
    setAuthQrPolling(false);
    setAuthQrError(null);
    setAuthStatusLabel('正在生成钉钉授权二维码...');

    try {
      const response = await createDingtalkAuthQr({
        configPath: result.configPath
      });
      setAuthQrResult({
        ...response,
        expiresIn: Math.min(response.expiresIn, DINGTALK_QR_DISPLAY_TTL_SECS)
      });
      setAuthStatusLabel('请使用手机钉钉扫码并确认授权');
    } catch (error) {
      setAuthQrError(error instanceof Error ? error.message : String(error));
      setAuthQrResult(null);
    } finally {
      setAuthQrLoading(false);
    }
  }

  async function waitQrStatusOnce() {
    if (
      !authQrResult?.deviceCode ||
      authQrResult.expiresIn <= 0 ||
      waitingRef.current ||
      stoppedRef.current
    ) {
      return;
    }

    waitingRef.current = true;
    setAuthQrPolling(true);
    setAuthQrError(null);
    try {
      const response = await inspectDingtalkAuthQrStatus({
        configPath: result.configPath,
        deviceCode: authQrResult.deviceCode
      });
      if (response.detail) {
        setAuthStatusLabel(response.detail);
      }

      if (response.status === 'authorized') {
        setAuthQrPolling(false);
        setAuthDialogOpen(false);
        setAuthStatusLabel(response.detail ?? '钉钉授权完成');
        toast.success('钉钉扫码授权成功，凭证已写入本地配置。');
        return;
      }

      if (response.status === 'expired') {
        setAuthQrPolling(false);
        setAuthQrError(response.detail ?? '二维码已失效，请重新生成。');
        setAuthQrResult((current) =>
          current
            ? {
                ...current,
                expiresIn: 0
              }
            : current
        );
        return;
      }
    } catch (error) {
      setAuthQrError(error instanceof Error ? error.message : String(error));
      setAuthQrPolling(false);
    } finally {
      waitingRef.current = false;
    }
  }

  useEffect(() => {
    setForm(createDingtalkChannelFormState(dingtalk));
  }, [dingtalk]);

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
    if (!authDialogOpen || !authQrResult?.deviceCode) {
      return;
    }

    stoppedRef.current = false;
    void waitQrStatusOnce();

    const intervalMs = Math.max(authQrResult.interval, 3) * 1000;
    const timer = window.setInterval(() => {
      void waitQrStatusOnce();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
      stoppedRef.current = true;
    };
  }, [authDialogOpen, authQrResult?.deviceCode, authQrResult?.expiresIn, authQrResult?.interval]);

  useEffect(() => {
    if (!authDialogOpen) {
      stoppedRef.current = true;
      waitingRef.current = false;
      setAuthQrPolling(false);
    }
  }, [authDialogOpen]);

  useEffect(() => {
    if (!authDialogOpen || !authQrResult || authQrResult.expiresIn > 0) {
      return;
    }

    stoppedRef.current = true;
    waitingRef.current = false;
    setAuthQrPolling(false);
    setAuthStatusLabel('二维码展示时间已到，请点击手动刷新重新生成。');
  }, [authDialogOpen, authQrResult]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 animate-fade-in flex-col">
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="flex flex-col gap-6 pb-6">
          {showPostInstallGuide ? (
            <div className="animate-fade-in rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] px-5 py-4 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
                <div className="flex flex-col gap-2">
                  <strong>钉钉插件已经注册完成，下一步配置机器人接入信息。</strong>
                  <span>当前安装阶段只负责把 `{pluginInstallResult?.pluginEntryId}` 注册到 OpenClaw；您现在可以直接在应用内发起官方扫码授权。</span>
                  <div className="grid gap-1 text-[11px] text-[hsl(var(--body))]">
                    <span>1. 点击“官方扫码授权”可一键创建/授权机器人并自动回填凭证。</span>
                    <span>2. 若您已有现成应用，也可手动填写 `Client ID` / `Client Secret`。</span>
                    <span>3. 按需配置私聊/群聊策略并保存配置，随后重启 OpenClaw 服务。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
              <Smartphone className="h-4 w-4 text-[hsl(var(--primary))]" />
              官方扫码授权链路
            </div>
            <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
              这里直接复用钉钉官方 `dingtalk-openclaw-connector` 的 device flow：生成二维码、手机钉钉扫码授权，成功后自动把凭证写回当前 OpenClaw 安装配置。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void beginQrAuthorization()}
                disabled={postInstallActionLoading || authQrLoading}
                className="h-9 text-[11px] font-semibold"
              >
                <Smartphone className="mr-2 h-4 w-4" />
                {dingtalk?.configured ? '重新扫码授权' : '官方扫码授权'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleOpenUrl(resolvedLinks.docs)}
                className="h-9 text-[11px] font-medium"
              >
                <BookOpen className="mr-2 h-3.5 w-3.5" />
                查看官方说明
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <DingtalkChannelForm
              form={{
                ...form,
                enabled: effectiveEnabled
              }}
              status={dingtalk}
              loading={postInstallActionLoading}
              hideEnableToggle={hideInternalEnableToggle}
              credentialAssistant={credentialAssistant}
              secretVisibility={secretVisibility}
              onFieldChange={handleFieldChange}
              onToggleSecret={handleToggleSecret}
            />

            <DingtalkDocLinksCard
              clientId={form.clientId}
              activeStep={null}
              onOpenUrl={handleOpenUrl}
              onOpenFaq={() => setHelpDialogOpen(true)}
            />
          </div>

          {dingtalkSetupResult ? (
            <div className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
              <div>
                <strong>钉钉通道配置写入成功！</strong>
                <span> 凭证已写入。您可以在运行控制中心重启 OpenClaw 服务以更新底层通道进程。</span>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="relative z-10 mt-2 flex-none border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] pt-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted))]">
            {dingtalk?.configured ? (
              <>
                <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                已存在旧配置，您可以直接继续调整。
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                尚未配置有效的钉钉接入凭据。
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
                void onDingtalkChannelSetup(
                  buildDingtalkChannelSetupPayload(result.configPath, {
                    ...form,
                    enabled: effectiveEnabled
                  })
                )
              }
              className="h-10 min-w-[160px] flex-1 cursor-pointer bg-[hsl(var(--primary))] font-medium text-[hsl(var(--on-primary))] shadow-sm hover:bg-[hsl(var(--primary-active))] sm:flex-none"
            >
              {dingtalkSetupLoading ? (
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

      <DingtalkHelpDialog
        open={helpDialogOpen}
        copied={copiedText === DINGTALK_PERMISSION_TROUBLESHOOTING.copyText}
        onOpenChange={setHelpDialogOpen}
        onCopy={() => copyToClipboard(DINGTALK_PERMISSION_TROUBLESHOOTING.copyText)}
        onOpenPermissions={() => void handleOpenUrl(resolvedLinks.permissions)}
      />

      <DingtalkAuthQrDialog
        open={authDialogOpen}
        loading={authQrLoading}
        polling={authQrPolling}
        error={authQrError}
        statusLabel={authStatusLabel}
        verificationUriComplete={authQrResult?.verificationUriComplete ?? null}
        expiresIn={authQrResult?.expiresIn ?? null}
        onOpenChange={setAuthDialogOpen}
        onGenerate={() => void beginQrAuthorization()}
        onOpenLink={(url) => void handleOpenUrl(url)}
      />
    </div>
  );
}
