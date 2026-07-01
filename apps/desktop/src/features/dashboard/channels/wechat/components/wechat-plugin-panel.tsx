import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Shield,
  Smartphone,
  Unplug
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { ScrollArea } from '../../../../../components/ui/scroll-area';
import {
  inspectWeixinLoginStatus,
  startWeixinLoginQr,
  waitForWeixinLoginQr
} from '../../../../installer/api/installer-api';
import type {
  OpenClawPostInstallStatus,
  OpenClawPluginInstallResult,
  OpenClawInstallResult,
  WeixinLoginQrWaitResult,
  WeixinLoginStatus
} from '../../../../installer/model/types';
import { resolveWechatChannel } from '../model/wechat-channel';
import { WechatLoginQrDialog } from './wechat-login-qr-dialog';

export type WechatPluginPanelProps = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  pluginInstallResult?: OpenClawPluginInstallResult | null;
  hideInternalEnableToggle?: boolean;
  forceEnabled?: boolean;
  onForceEnabledHandled?: () => void;
  loginBusy?: boolean;
};

export function WechatPluginPanel({
  result,
  status,
  statusLoading,
  pluginInstallResult = null,
  forceEnabled = false,
  onForceEnabledHandled
}: WechatPluginPanelProps) {
  const wechat = resolveWechatChannel(status);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loginBlocking, setLoginBlocking] = useState(false);
  const [loginPolling, setLoginPolling] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState('等待扫码中');
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [needsVerifyCode, setNeedsVerifyCode] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [loginStatus, setLoginStatus] = useState<WeixinLoginStatus | null>(null);
  const waitingRef = useRef(false);
  const stoppedRef = useRef(false);

  const configuredAccountIds = useMemo(
    () => loginStatus?.configuredAccountIds ?? wechat?.configuredAccountIds ?? [],
    [loginStatus?.configuredAccountIds, wechat?.configuredAccountIds]
  );
  const showPostInstallGuide = Boolean(
    pluginInstallResult && pluginInstallResult.pluginId === 'wechat' && !wechat?.configured
  );

  async function loadLoginStatus() {
    try {
      const next = await inspectWeixinLoginStatus(result.configPath);
      setLoginStatus(next);
      return next;
    } catch (error) {
      console.error('[微信 ClawBot] 查询登录状态失败', error);
      return null;
    }
  }

  function copyToClipboard(value: string) {
    navigator.clipboard.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue(null), 2000);
  }

  function resetDialogState() {
    stoppedRef.current = false;
    setLoginError(null);
    setVerifyCode('');
    setNeedsVerifyCode(false);
    setStatusLabel('等待扫码中');
  }

  async function beginLogin(force = false) {
    setDialogOpen(true);
    setLoginBlocking(true);
    setLoginPolling(false);
    resetDialogState();

    try {
      const response = await startWeixinLoginQr({
        configPath: result.configPath,
        force,
        accountId: wechat?.accountId || loginStatus?.accountId || undefined
      });
      setSessionKey(response.sessionKey);
      setQrDataUrl(response.qrDataUrl);
      setExpiresIn(response.expiresIn);
      setStatusLabel(response.message);
      setNeedsVerifyCode(response.requiresVerifyCode);
      setLoginError(null);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoginBlocking(false);
    }
  }

  async function applyWaitOutcome(outcome: WeixinLoginQrWaitResult) {
    if (outcome.qrDataUrl) {
      setQrDataUrl(outcome.qrDataUrl);
    }
    if (typeof outcome.expiresIn === 'number') {
      setExpiresIn(outcome.expiresIn);
    }
    setStatusLabel(outcome.message);
    setNeedsVerifyCode(outcome.needsVerifyCode);

    if (outcome.needsVerifyCode) {
      setLoginBlocking(false);
      setLoginPolling(false);
      return;
    }

    if (outcome.verifyCodeBlocked || outcome.expired) {
      setVerifyCode('');
      setExpiresIn(0);
      setLoginBlocking(false);
      setLoginPolling(false);
      return;
    }

    if (outcome.connected) {
      setDialogOpen(false);
      setLoginBlocking(false);
      setLoginPolling(false);
      await loadLoginStatus();
      toast.success('微信 ClawBot 登录成功，已写入本地账号配置。');
      return;
    }

    if (outcome.alreadyConnected) {
      setDialogOpen(false);
      setLoginBlocking(false);
      setLoginPolling(false);
      await loadLoginStatus();
      toast.success('该微信账号已绑定当前 OpenClaw，无需重复登录。');
      return;
    }

    setLoginBlocking(false);
    setLoginPolling(false);
  }

  async function waitOnce(submittedVerifyCode?: string) {
    if (!sessionKey || waitingRef.current || stoppedRef.current) {
      return;
    }

    waitingRef.current = true;
    setLoginError(null);
    if (submittedVerifyCode) {
      setLoginBlocking(true);
      setLoginPolling(false);
    } else {
      setLoginPolling(true);
    }
    try {
      const waitResult = await waitForWeixinLoginQr({
        configPath: result.configPath,
        sessionKey,
        verifyCode: submittedVerifyCode,
        timeoutMs: submittedVerifyCode ? 30_000 : 50_000
      });
      await applyWaitOutcome(waitResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginError(message);
      setLoginBlocking(false);
      setLoginPolling(false);
    } finally {
      if (!submittedVerifyCode) {
        setLoginPolling(false);
      }
      waitingRef.current = false;
    }
  }

  async function handleSubmitVerifyCode() {
    if (!verifyCode.trim()) {
      return;
    }
    await waitOnce(verifyCode.trim());
    setVerifyCode('');
  }

  useEffect(() => {
    void loadLoginStatus();
  }, [result.configPath]);

  useEffect(() => {
    if (!forceEnabled) {
      return;
    }
    void beginLogin(false);
    onForceEnabledHandled?.();
  }, [forceEnabled, onForceEnabledHandled]);

  useEffect(() => {
    if (!dialogOpen || !sessionKey || needsVerifyCode) {
      return;
    }

    stoppedRef.current = false;
    void waitOnce();

    const timer = window.setInterval(() => {
      void waitOnce();
    }, 4000);

    return () => {
      window.clearInterval(timer);
      stoppedRef.current = true;
    };
  }, [dialogOpen, sessionKey, needsVerifyCode]);

  useEffect(() => {
    if (!dialogOpen) {
      stoppedRef.current = true;
      waitingRef.current = false;
      setVerifyCode('');
      setNeedsVerifyCode(false);
      setLoginBlocking(false);
      setLoginPolling(false);
    }
  }, [dialogOpen]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 animate-fade-in flex-col">
      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="flex flex-col gap-6 pb-6">
          {showPostInstallGuide ? (
            <div className="animate-fade-in rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.06)] px-5 py-4 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
                <div className="flex flex-col gap-2">
                  <strong>微信插件已经注册完成，下一步需要完成扫码登录。</strong>
                  <span>当前安装阶段只负责把 `{pluginInstallResult?.pluginEntryId}` 注册到 OpenClaw，真正的微信绑定会在应用内执行二维码登录。</span>
                  <div className="grid gap-1 text-[11px] text-[hsl(var(--body))]">
                    <span>1. 点击下方“开始扫码登录”生成微信二维码。</span>
                    <span>2. 在手机微信里扫码并确认授权。</span>
                    <span>3. 若手机显示数字验证码，在弹窗中输入对应数字继续绑定。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.4] p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
                <MessageCircleMore className="h-4 w-4 text-[hsl(var(--primary))]" />
                通道状态
              </div>
              <div className="space-y-2 text-[11px] leading-relaxed text-[hsl(var(--body))]">
                <div className="flex items-center justify-between">
                  <span>插件安装</span>
                  <strong className={wechat?.installed ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted))]'}>
                    {wechat?.installed ? '已安装' : '未安装'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>通道启用</span>
                  <strong className={wechat?.enabled ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted))]'}>
                    {wechat?.enabled ? '已启用' : '未启用'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>微信登录</span>
                  <strong className={wechat?.configured ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}>
                    {wechat?.configured ? '已连接' : '未连接'}
                  </strong>
                </div>
                <div className="pt-2 text-[10px] text-[hsl(var(--muted))]">
                  当前账号：<span className="font-mono text-[hsl(var(--body-strong))]">{wechat?.accountId || loginStatus?.accountId || 'default'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
                <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
                官方扫码登录链路
              </div>
              <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
                此流程直接复用腾讯微信官方 `openclaw-weixin` 插件的二维码协议：桌面端获取二维码并长轮询状态，登录成功后将 bot token 写入本地账号目录。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void beginLogin(true)}
                  disabled={statusLoading || loginBlocking}
                  className="h-9 text-[11px] font-semibold"
                >
                  {loginBlocking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      正在处理登录...
                    </>
                  ) : (
                    <>
                      <Smartphone className="mr-2 h-4 w-4" />
                      {wechat?.configured ? '重新扫码登录' : '开始扫码登录'}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadLoginStatus()}
                  disabled={statusLoading || loginBlocking}
                  className="h-9 text-[11px] font-medium"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  刷新状态
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
              <Unplug className="h-4 w-4 text-[hsl(var(--primary))]" />
              已登记账号
            </div>
            {configuredAccountIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {configuredAccountIds.map((accountId) => (
                  <span
                    key={accountId}
                    className="inline-flex items-center rounded-full border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] px-3 py-1 text-[10px] font-mono text-[hsl(var(--body-strong))]"
                  >
                    {accountId}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[hsl(var(--muted))]">
                还没有已登录的微信账号。完成扫码后，账号会写入 `openclaw-weixin/accounts/`。
              </p>
            )}
          </div>

          {wechat?.configured ? (
            <div className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] shadow-2xs">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
              <div>
                <strong>微信 ClawBot 已完成本地账号绑定。</strong>
                <span> 如刚完成扫码，请前往运行控制中心重启 OpenClaw 服务，使 `openclaw-weixin` 通道重新加载凭证。</span>
              </div>
            </div>
          ) : null}

          {loginError ? (
            <div className="rounded-lg border border-[hsl(var(--error)/0.2)] bg-[hsl(var(--error)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
              {loginError}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <WechatLoginQrDialog
        open={dialogOpen}
        blocking={loginBlocking}
        polling={loginPolling}
        statusLabel={statusLabel}
        error={loginError}
        qrDataUrl={qrDataUrl}
        expiresIn={expiresIn}
        verifyCode={verifyCode}
        needsVerifyCode={needsVerifyCode}
        copiedValue={copiedValue}
        onOpenChange={setDialogOpen}
        onVerifyCodeChange={setVerifyCode}
        onGenerate={() => void beginLogin(true)}
        onSubmitVerifyCode={() => void handleSubmitVerifyCode()}
        onCopy={copyToClipboard}
      />
    </div>
  );
}
