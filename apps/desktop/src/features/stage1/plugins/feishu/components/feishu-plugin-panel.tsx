import { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Check,
  RefreshCw,
  AlertTriangle,
  Shield,
  Radio,
  Webhook,
  Eye,
  EyeOff,
  Copy,
  Settings2,
  BookOpen,
  Hash,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { ScrollArea } from '../../../../../components/ui/scroll-area';
import { Select } from '../../../../../components/ui/select';
import { createFeishuAuthQr, inspectFeishuAuthQrStatus, openExternalUrl } from '../../../api/stage1-api';
import { FeishuAuthQrDialog } from './feishu-auth-qr-dialog';
import { FeishuDocLinksCard } from './feishu-doc-links-card';
import { FeishuHelpDialog } from './feishu-help-dialog';
import { FEISHU_PERMISSION_TROUBLESHOOTING, getFeishuConsoleLinks } from '../model/feishu-docs';
import type { FeishuAuthQrResult } from '../../../model/types';
import type {
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawPostInstallStatus,
  Stage1InstallResult
} from '../../../model/types';

export type FeishuPluginPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  onFeishuChannelSetup: (input: OpenClawFeishuChannelSetupPayload) => Promise<OpenClawFeishuChannelSetupResult | null>;
  hideInternalEnableToggle?: boolean;
  forceEditing?: boolean;
  onForceEditingHandled?: () => void;
  forceEnabled?: boolean;
  onForceEnabledHandled?: () => void;
};

function parseCsv(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={`group flex items-start justify-between gap-4 rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none bg-[hsl(var(--canvas))] ${checked
        ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--surface-soft))] shadow-2xs'
        : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] hover:bg-[hsl(var(--surface-soft))/0.2]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex flex-col gap-0.5 flex-1 pr-2">
        <span
          className={`text-xs font-semibold text-[hsl(var(--body-strong))] transition-colors ${checked ? 'text-[hsl(var(--primary))]' : 'group-hover:text-[hsl(var(--primary))]'
            }`}
        >
          {label}
        </span>
        {description && (
          <span className="text-[10px] text-[hsl(var(--muted))] leading-relaxed mt-0.5">{description}</span>
        )}
      </div>
      <div
        onClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          onChange(!checked);
        }}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2 ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
          }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'
            }`}
        />
      </div>
    </label>
  );
}

export function FeishuPluginPanel({
  result,
  status,
  statusLoading,
  feishuSetupLoading,
  feishuSetupResult,
  onFeishuChannelSetup,
  hideInternalEnableToggle = false,
  forceEditing = false,
  onForceEditingHandled,
  forceEnabled = false,
  onForceEnabledHandled
}: FeishuPluginPanelProps) {
  const feishu = status?.feishuChannel;
  const [isEditing, setIsEditing] = useState(!feishu?.configured);
  const [enabled, setEnabled] = useState(false);
  const [domain, setDomain] = useState<'feishu' | 'lark'>('feishu');
  const [connectionMode, setConnectionMode] = useState<'websocket' | 'webhook'>('websocket');
  const [defaultAccount, setDefaultAccount] = useState('default');
  const [accountName, setAccountName] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [dmPolicy, setDmPolicy] = useState<'allowlist' | 'pairing' | 'open' | 'disabled'>('allowlist');
  const [allowFrom, setAllowFrom] = useState('');
  const [groupPolicy, setGroupPolicy] = useState<'allowlist' | 'open' | 'disabled'>('allowlist');
  const [groupAllowFrom, setGroupAllowFrom] = useState('');
  const [requireMention, setRequireMention] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [blockStreaming, setBlockStreaming] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(true);
  const [resolveSenderNames, setResolveSenderNames] = useState(true);
  const [verificationToken, setVerificationToken] = useState('');
  const [encryptKey, setEncryptKey] = useState('');
  const [webhookPath, setWebhookPath] = useState('/feishu/events');
  const [webhookHost, setWebhookHost] = useState('127.0.0.1');
  const [webhookPort, setWebhookPort] = useState('3000');
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [showVerificationToken, setShowVerificationToken] = useState(false);
  const [showEncryptKey, setShowEncryptKey] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [authQrDialogOpen, setAuthQrDialogOpen] = useState(false);
  const [authQrLoading, setAuthQrLoading] = useState(false);
  const [authQrError, setAuthQrError] = useState<string | null>(null);
  const [authQrResult, setAuthQrResult] = useState<FeishuAuthQrResult | null>(null);
  const [activeStep, setActiveStep] = useState<'credentials' | 'bot' | 'event' | 'release' | null>(null);
  const authQrPollingLockRef = useRef(false);
  const authQrPollingFinishedRef = useRef(false);
  const resolvedLinks = getFeishuConsoleLinks(appId, domain);
  const effectiveEnabled = hideInternalEnableToggle ? true : enabled;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  }

  async function handleOpenUrl(url: string) {
    try {
      await openExternalUrl({ url });
    } catch (error) {
      console.error('[飞书文档] 打开链接失败', error);
    }
  }

  async function handleGenerateAuthQr() {
    const currentAppId = appId.trim() || feishu?.appId?.trim() || '';
    const currentSecret = appSecret.trim();

    if (!currentAppId) {
      setAuthQrError('请先填写或保存 App ID，再生成二维码。');
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
        domain
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
    if (!feishu) {
      return;
    }

    setEnabled(feishu.enabled);
    setDomain(feishu.domain === 'lark' ? 'lark' : 'feishu');
    setConnectionMode(feishu.connectionMode === 'webhook' ? 'webhook' : 'websocket');
    setDefaultAccount(feishu.defaultAccount || 'default');
    setAccountName(feishu.accountName ?? '');
    setAppId(feishu.appId ?? '');
    setAppSecret('');
    setDmPolicy(
      feishu.dmPolicy === 'pairing' || feishu.dmPolicy === 'open' || feishu.dmPolicy === 'disabled'
        ? feishu.dmPolicy
        : 'allowlist'
    );
    setAllowFrom(feishu.allowFrom.join(', '));
    setGroupPolicy(feishu.groupPolicy === 'open' || feishu.groupPolicy === 'disabled' ? feishu.groupPolicy : 'allowlist');
    setGroupAllowFrom(feishu.groupAllowFrom.join(', '));
    setRequireMention(feishu.requireMention);
    setStreaming(feishu.streaming);
    setBlockStreaming(feishu.blockStreaming);
    setTypingIndicator(feishu.typingIndicator);
    setResolveSenderNames(feishu.resolveSenderNames);
    setVerificationToken('');
    setEncryptKey('');
    setWebhookPath(feishu.webhookPath ?? '/feishu/events');
    setWebhookHost(feishu.webhookHost ?? '127.0.0.1');
    setWebhookPort(feishu.webhookPort ? String(feishu.webhookPort) : '3000');
  }, [feishu]);

  useEffect(() => {
    if (!authQrDialogOpen || !authQrResult?.deviceCode) {
      return;
    }

    const currentAppId = appId.trim() || feishu?.appId?.trim() || '';
    const currentSecret = appSecret.trim();
    if (!currentAppId || !currentSecret) {
      return;
    }

    let disposed = false;
    const intervalMs = Math.max((authQrResult.interval || 5) * 1000, 3000);

    const poll = async () => {
      if (disposed) {
        return;
      }

      if (authQrPollingLockRef.current || authQrPollingFinishedRef.current) {
        return;
      }

      authQrPollingLockRef.current = true;
      try {
        const status = await inspectFeishuAuthQrStatus({
          appId: currentAppId,
          appSecret: currentSecret,
          domain,
          deviceCode: authQrResult.deviceCode
        });

        if (disposed) {
          return;
        }

        if (status.status === 'authorized') {
          authQrPollingFinishedRef.current = true;
          setAuthQrDialogOpen(false);
          toast.success('飞书插件扫码授权已完成。');
          return;
        }

        if (status.status === 'expired') {
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
  }, [
    appId,
    appSecret,
    authQrDialogOpen,
    authQrResult?.deviceCode,
    authQrResult?.interval,
    domain,
    feishu?.appId
  ]);

  useEffect(() => {
    if (!authQrDialogOpen) {
      authQrPollingLockRef.current = false;
      authQrPollingFinishedRef.current = false;
    }
  }, [authQrDialogOpen]);

  useEffect(() => {
    if (feishu) {
      setIsEditing(!feishu.configured);
    }
  }, [feishu?.configured]);

  useEffect(() => {
    if (!forceEditing) {
      return;
    }

    setIsEditing(true);
    onForceEditingHandled?.();
  }, [forceEditing, onForceEditingHandled]);

  useEffect(() => {
    if (!forceEnabled) {
      return;
    }

    setEnabled(true);
    onForceEnabledHandled?.();
  }, [forceEnabled, onForceEnabledHandled]);

  function resetFormToCurrentStatus() {
    if (!feishu) return;
    setEnabled(feishu.enabled);
    setDomain(feishu.domain === 'lark' ? 'lark' : 'feishu');
    setConnectionMode(feishu.connectionMode === 'webhook' ? 'webhook' : 'websocket');
    setDefaultAccount(feishu.defaultAccount || 'default');
    setAccountName(feishu.accountName ?? '');
    setAppId(feishu.appId ?? '');
    setAppSecret('');
    setDmPolicy(
      feishu.dmPolicy === 'pairing' || feishu.dmPolicy === 'open' || feishu.dmPolicy === 'disabled'
        ? feishu.dmPolicy
        : 'allowlist'
    );
    setAllowFrom(feishu.allowFrom.join(', '));
    setGroupPolicy(feishu.groupPolicy === 'open' || feishu.groupPolicy === 'disabled' ? feishu.groupPolicy : 'allowlist');
    setGroupAllowFrom(feishu.groupAllowFrom.join(', '));
    setRequireMention(feishu.requireMention);
    setStreaming(feishu.streaming);
    setBlockStreaming(feishu.blockStreaming);
    setTypingIndicator(feishu.typingIndicator);
    setResolveSenderNames(feishu.resolveSenderNames);
    setVerificationToken('');
    setEncryptKey('');
    setWebhookPath(feishu.webhookPath ?? '/feishu/events');
    setWebhookHost(feishu.webhookHost ?? '127.0.0.1');
    setWebhookPort(feishu.webhookPort ? String(feishu.webhookPort) : '3000');
  }

  const postInstallActionLoading = statusLoading || feishuSetupLoading;

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 relative animate-fade-in">
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="flex flex-col gap-6 pb-6">

          {!isEditing && feishu?.configured ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-[hsl(var(--hairline))] pb-5">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))]">
                  <div className="text-[hsl(var(--primary))] shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">服务通道类型</span>
                    <strong className="text-base font-medium text-[hsl(var(--body-strong))] truncate block mt-0.5 capitalize">
                      {feishu?.connectionMode || 'websocket'}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))]">
                  <div className="rounded-xl shadow-2xs text-blue-500 shrink-0">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">Bot App ID</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))] truncate">
                        {feishu?.appId || '未配置'}
                      </strong>
                      {feishu?.appId && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(feishu.appId || '')}
                          className="text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 rounded hover:bg-[hsl(var(--canvas))] transition-all"
                          title="复制 App ID"
                        >
                          {copiedText === feishu.appId ? (
                            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-xl bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))]">
                  <div className="rounded-xl  shadow-2xs text-purple-500 shrink-0">
                    <Settings2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">账号与昵称</span>
                    <strong className="text-sm font-medium text-[hsl(var(--body-strong))] truncate block mt-0.5">
                      {feishu?.accountName || '未命名'} ({feishu?.defaultAccount || 'default'})
                    </strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-[hsl(var(--hairline))] pb-5">
                <div className="flex flex-col gap-3">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--body-strong))]">
                      <Shield className="w-4 h-4 text-[hsl(var(--primary))]" />
                      私聊安全策略 (DM Policy)
                    </h4>
                    <p className="text-[10px] text-[hsl(var(--muted))] mt-1">控制单聊对话中机器人的安全响应机制</p>
                  </div>
                  <div className="flex flex-col gap-3 bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-xl flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[hsl(var(--muted))] font-medium">当前策略:</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${feishu?.dmPolicy === 'open'
                          ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.2)]'
                          : feishu?.dmPolicy === 'allowlist'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900'
                            : feishu?.dmPolicy === 'pairing'
                              ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-900'
                              : 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-800'
                          }`}
                      >
                        {feishu?.dmPolicy || 'disabled'}
                      </span>
                    </div>
                    {feishu?.dmPolicy === 'allowlist' && (
                      <div className="flex flex-col gap-1.5 border-t border-[hsl(var(--hairline))] pt-3">
                        <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">允许私聊的 User ID</span>
                        {feishu.allowFrom.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {feishu.allowFrom.map((id) => (
                              <span key={id} className="font-mono text-[9px] px-2 py-0.5 rounded bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))]">
                                {id}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-[hsl(var(--muted))] italic">空（未添加任何 ID）</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--body-strong))]">
                      <Shield className="w-4 h-4 text-[hsl(var(--primary))]" />
                      群聊安全策略 (Group Policy)
                    </h4>
                    <p className="text-[10px] text-[hsl(var(--muted))] mt-1">限制机器人在飞书群聊中的事件分发</p>
                  </div>
                  <div className="flex flex-col gap-3 bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-xl flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[hsl(var(--muted))] font-medium">当前策略:</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${feishu?.groupPolicy === 'open'
                          ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.2)]'
                          : feishu?.groupPolicy === 'allowlist'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900'
                            : 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-800'
                          }`}
                      >
                        {feishu?.groupPolicy || 'disabled'}
                      </span>
                    </div>
                    {feishu?.groupPolicy === 'allowlist' && (
                      <div className="flex flex-col gap-1.5 border-t border-[hsl(var(--hairline))] pt-3">
                        <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">允许的飞书群聊 Chat ID</span>
                        {feishu.groupAllowFrom.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {feishu.groupAllowFrom.map((id) => (
                              <span key={id} className="font-mono text-[9px] px-2 py-0.5 rounded bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))]">
                                {id}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-[hsl(var(--muted))] italic">空（未添加任何 ID）</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--body-strong))] px-1">
                  <BookOpen className="w-4 h-4 text-[hsl(var(--primary))]" />
                  交互特性与细节状态
                </h4>
                <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] rounded-xl p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-0.5 border-r border-[hsl(var(--hairline))] pr-4">
                      <span className="text-[9px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">群聊被提及 (@)</span>
                      <strong className="text-xs font-semibold text-[hsl(var(--body-strong))] mt-1 flex items-center gap-1">
                        {feishu?.requireMention ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            必须艾特
                          </>
                        ) : (
                          '直接响应'
                        )}
                      </strong>
                    </div>

                    <div className="flex flex-col gap-0.5 border-r border-[hsl(var(--hairline))] pr-4">
                      <span className="text-[9px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">流式卡片回复</span>
                      <strong className="text-xs font-semibold text-[hsl(var(--body-strong))] mt-1 flex items-center gap-1">
                        {feishu?.streaming ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            流式 ({feishu?.blockStreaming ? '分块' : '卡片'})
                          </>
                        ) : (
                          '标准卡片'
                        )}
                      </strong>
                    </div>

                    <div className="flex flex-col gap-0.5 border-r border-[hsl(var(--hairline))] pr-4">
                      <span className="text-[9px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">输入状态指示器</span>
                      <strong className="text-xs font-semibold text-[hsl(var(--body-strong))] mt-1 flex items-center gap-1">
                        {feishu?.typingIndicator ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            已启用
                          </>
                        ) : (
                          '无状态'
                        )}
                      </strong>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">解析发送者姓名</span>
                      <strong className="text-xs font-semibold text-[hsl(var(--body-strong))] mt-1 flex items-center gap-1">
                        {feishu?.resolveSenderNames ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                            自动获取
                          </>
                        ) : (
                          '隐藏'
                        )}
                      </strong>
                    </div>
                  </div>

                  {feishu?.connectionMode === 'webhook' && (
                    <div className="mt-2 p-4 rounded-xl border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.03)] flex flex-col gap-2">
                      <div className="text-xs font-semibold text-[hsl(var(--warning))] flex items-center gap-1.5">
                        <Webhook className="w-3.5 h-3.5" />
                        Webhook 模式详细参数
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[10px] text-[hsl(var(--body))]">
                        <div>事件路由: {feishu?.webhookPath || '/feishu/events'}</div>
                        <div>绑定Host: {feishu?.webhookHost || '127.0.0.1'}</div>
                        <div>绑定端口: {feishu?.webhookPort || '3000'}</div>
                        <div>签名校验 Token: {feishu?.verificationTokenConfigured ? '•••••••• (已写入)' : '未配置'}</div>
                        <div>加密 Key: {feishu?.encryptKeyConfigured ? '•••••••• (已写入)' : '未配置'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {feishu?.connectionMode === 'websocket' && (
                <div className="rounded-xl border border-[hsl(var(--success)/0.18)] bg-[hsl(var(--success)/0.04)] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))] flex items-start gap-3">
                  <Shield className="w-4 h-4 text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>WebSocket 长连接配置正常。</strong>
                    <span>
                      不需要在公网暴露回调端口，OpenClaw 会与飞书服务器保持持久通信。如果遇到通道无法接收消息，请确认您已在飞书平台开启了「长连接订阅方式」并在控制台部署了机器人。
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* 1. 飞书通道开关与连接基本凭据 */}
              <div className="flex flex-col gap-4 border-b border-[hsl(var(--hairline))] pb-6">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--primary))]">
                    <Settings2 className="w-4 h-4" />
                    1. 飞书通道开关与连接基本凭据
                  </h3>
                  <p className="text-[10px] text-[hsl(var(--muted))] mt-1">配置您的飞书自建应用对接参数以拉起核心通道连接</p>
                </div>
                <div className="flex flex-col gap-5 mt-2">
                  {!hideInternalEnableToggle ? (
                    <div className="bg-[hsl(var(--surface-soft))] p-4 rounded-xl border border-[hsl(var(--hairline))] flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[hsl(var(--body-strong))]">启用飞书通道功能 (Enable Feishu)</span>
                        <span className="text-[10px] text-[hsl(var(--muted))] leading-normal">
                          激活后写入对应配置文件，在启动 OpenClaw Runtime 时会自动加载飞书插件与长连接服务。
                        </span>
                      </div>
                      <div
                        onClick={() => {
                          if (postInstallActionLoading) {
                            return;
                          }
                          setEnabled(!enabled);
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] ${enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">应用服务商 Domain</label>
                      <Select
                        value={domain}
                        onChange={(e) => setDomain(e.target.value as 'feishu' | 'lark')}
                        onFocus={() => setActiveStep('credentials')}
                        onBlur={() => setActiveStep(null)}
                      >
                        <option value="feishu">Feishu (飞书 - 国内版)</option>
                        <option value="lark">Lark (国外版)</option>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">App ID</label>
                      <Input
                        value={appId}
                        onChange={(event) => setAppId(event.target.value)}
                        placeholder="cli_xxx"
                        className="font-mono text-xs"
                        onFocus={() => setActiveStep('credentials')}
                        onBlur={() => setActiveStep(null)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">App Secret</label>
                      <div className="relative flex items-center">
                        <Input
                          type={showAppSecret ? 'text' : 'password'}
                          value={appSecret}
                          onChange={(event) => setAppSecret(event.target.value)}
                          placeholder={feishu?.configured ? '•••••••••••••••••••• (留空表示维持上次的配置)' : '输入飞书 App Secret'}
                          className="pr-10 font-mono text-xs tracking-wider"
                          onFocus={() => setActiveStep('credentials')}
                          onBlur={() => setActiveStep(null)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAppSecret(!showAppSecret)}
                          className="absolute right-3 text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 transition-colors animate-fade-in"
                        >
                          {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] mt-1 animate-fade-in shadow-2xs">
                      <div className="space-y-1.5 flex-1">
                        <strong className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                          飞书凭证与插件授权配置助手
                        </strong>
                        <p className="text-[10px] text-[hsl(var(--muted))] leading-relaxed max-w-[500px]">
                          在「飞书开放平台」自建应用的「凭证与基础信息」中获取 App ID 和 App Secret。为防止调用权限不足，请在填写完成后在此生成授权二维码进行增量授权。
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:bg-[hsl(var(--surface-soft))]"
                            onClick={() => void handleOpenUrl(resolvedLinks.credentials)}
                          >
                            <ExternalLink className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
                            直达飞书凭证配置页 ↗
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:bg-[hsl(var(--surface-soft))]"
                            onClick={() => void handleOpenUrl(resolvedLinks.docs)}
                          >
                            <BookOpen className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
                            查看官方接入指引 📖
                          </Button>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => void handleGenerateAuthQr()}
                        className="w-full md:w-auto h-9 px-4 text-[11px] font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] shrink-0 self-stretch md:self-center flex items-center justify-center"
                      >
                        插件扫码授权
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 mt-2">
                    <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">连接模式 (Connection Mode)</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div
                        onClick={() => setConnectionMode('websocket')}
                        onMouseEnter={() => setActiveStep('event')}
                        onMouseLeave={() => setActiveStep(null)}
                        className={`group p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col gap-2 select-none ${connectionMode === 'websocket'
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] shadow-2xs'
                          : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] bg-[hsl(var(--canvas))]'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold flex items-center gap-1.5 text-[hsl(var(--ink))]">
                            <Radio className={`w-4 h-4 ${connectionMode === 'websocket' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted))]'}`} />
                            WebSocket 长连接模式
                          </span>
                          {connectionMode === 'websocket' && (
                            <span className="text-[9px] font-semibold bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] px-2 py-0.5 rounded-full">
                              推荐模式
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] leading-relaxed text-[hsl(var(--muted))]">
                          无需公网域名，本地开发直接长连官方事件流，避开网络反向代理及事件订阅验签，最适合桌面客户端。
                        </p>
                      </div>

                      <div
                        onClick={() => setConnectionMode('webhook')}
                        onMouseEnter={() => setActiveStep('event')}
                        onMouseLeave={() => setActiveStep(null)}
                        className={`group p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col gap-2 select-none ${connectionMode === 'webhook'
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] shadow-2xs'
                          : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] bg-[hsl(var(--canvas))]'
                          }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Webhook className={`w-4 h-4 ${connectionMode === 'webhook' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted))]'}`} />
                          <span className="text-xs font-semibold text-[hsl(var(--ink))]">Webhook 回调函数模式</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-[hsl(var(--muted))]">
                          传统 Webhook 架构。需要配置公网回调地址和验签 Token，适合在云端容器或生产服务器长期托管时使用。
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[hsl(var(--hairline))] pt-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">默认通道账户标识 (Default Account)</label>
                      <Input value={defaultAccount} onChange={(event) => setDefaultAccount(event.target.value)} className="text-xs font-mono" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">账户昵称 (Account Name)</label>
                      <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Primary bot" className="text-xs" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. 消息接入控制与安全白名单策略 */}
              <div
                className="flex flex-col gap-4 border-b border-[hsl(var(--hairline))] pb-6"
                onMouseEnter={() => setActiveStep('release')}
                onMouseLeave={() => setActiveStep(null)}
              >
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--primary))]">
                    <Shield className="w-4 h-4" />
                    2. 消息接入控制与安全白名单策略
                  </h3>
                  <p className="text-[10px] text-[hsl(var(--muted))] mt-1">限制与规范私聊及群聊的调用条件，防止意外交互或资源耗尽</p>
                </div>
                <div className="flex flex-col gap-4 mt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">私聊触发策略 (DM Policy)</label>
                      <Select
                        value={dmPolicy}
                        onChange={(e) => setDmPolicy(e.target.value as 'allowlist' | 'pairing' | 'open' | 'disabled')}
                        onFocus={() => setActiveStep('release')}
                        onBlur={() => setActiveStep(null)}
                      >
                        <option value="allowlist">Allowlist (仅限白名单用户触发)</option>
                        <option value="pairing">Pairing (特定配对授权响应)</option>
                        <option value="open">Open (对所有私聊会话开放响应)</option>
                        <option value="disabled">Disabled (禁用单聊响应)</option>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">群聊触发策略 (Group Policy)</label>
                      <Select
                        value={groupPolicy}
                        onChange={(e) => setGroupPolicy(e.target.value as 'allowlist' | 'open' | 'disabled')}
                        onFocus={() => setActiveStep('release')}
                        onBlur={() => setActiveStep(null)}
                      >
                        <option value="allowlist">Allowlist (仅限白名单群聊生效)</option>
                        <option value="open">Open (支持在所有群中艾特响应)</option>
                        <option value="disabled">Disabled (群聊场景静默不响应)</option>
                      </Select>
                    </div>

                    {dmPolicy === 'allowlist' && (
                      <div className="flex flex-col gap-1.5 md:col-span-2 animate-fade-in">
                        <label className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center justify-between">
                          <span>私聊响应白名单 (DM Allowlist)</span>
                          <span className="text-[10px] text-[hsl(var(--muted))]">配置允许的用户 Open ID。支持用英文逗号或换行符分隔。</span>
                        </label>
                        <Input
                          value={allowFrom}
                          onChange={(event) => setAllowFrom(event.target.value)}
                          placeholder="ou_xxx, ou_yyy"
                          className="font-mono text-xs"
                          onFocus={() => setActiveStep('release')}
                          onBlur={() => setActiveStep(null)}
                        />
                      </div>
                    )}

                    {groupPolicy === 'allowlist' && (
                      <div className="flex flex-col gap-1.5 md:col-span-2 animate-fade-in">
                        <label className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center justify-between">
                          <span>群聊响应白名单 (Group Allowlist)</span>
                          <span className="text-[10px] text-[hsl(var(--muted))]">配置允许生效的 Chat ID。支持用英文逗号或换行符分隔。</span>
                        </label>
                        <Input
                          value={groupAllowFrom}
                          onChange={(event) => setGroupAllowFrom(event.target.value)}
                          placeholder="oc_xxx, oc_yyy"
                          className="font-mono text-xs"
                          onFocus={() => setActiveStep('release')}
                          onBlur={() => setActiveStep(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. 交互特性与高级呈现选项 */}
              <div
                className="flex flex-col gap-4 border-b border-[hsl(var(--hairline))] pb-6"
                onMouseEnter={() => setActiveStep('bot')}
                onMouseLeave={() => setActiveStep(null)}
              >
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--primary))]">
                    <BookOpen className="w-4 h-4" />
                    3. 交互特性与高级呈现选项
                  </h3>
                  <p className="text-[10px] text-[hsl(var(--muted))] mt-1">自定义机器人在会话交互中的回复呈现和卡片渲染参数</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <Switch
                    label="群聊限定提及 (@ Mention)"
                    description="开启后在群中只有被显式 @ 的消息才会唤醒机器人。关闭后机器人可接收并解析群内所有公开消息。"
                    checked={requireMention}
                    onChange={setRequireMention}
                  />
                  <Switch
                    label="流式内容输出 (Streaming)"
                    description="支持飞书动态卡片增量刷新。机器人的响应结果将随着生成流渐进渲染，减低等待感。"
                    checked={streaming}
                    onChange={setStreaming}
                  />
                  {streaming && (
                    <Switch
                      label="分块延迟提交 (Block Streaming)"
                      description="当输出段落/列表完成时才向飞书卡片提交修改，可大幅度减缓飞书在流式长回答下的卡片闪烁。"
                      checked={blockStreaming}
                      onChange={setBlockStreaming}
                    />
                  )}
                  <Switch
                    label="正在输入指示 (Typing Indicator)"
                    description="在处理大模型耗时请求的过程中，聊天窗口顶部将常驻“机器人在输入中”状态，提升会话动效反馈。"
                    checked={typingIndicator}
                    onChange={setTypingIndicator}
                  />
                  <Switch
                    label="反解发送者实名 (Resolve Sender Names)"
                    description="是否在日志与事件中将加密的 Open ID 解析为清晰的用户真实展示姓名，会额外进行一次飞书 API 查询。"
                    checked={resolveSenderNames}
                    onChange={setResolveSenderNames}
                    disabled={postInstallActionLoading}
                  />
                </div>
              </div>

              {/* 4. Webhook 模式附加网络回调配置 */}
              {connectionMode === 'webhook' && (
                <div className="flex flex-col gap-4 border-b border-[hsl(var(--hairline))] pb-6">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--warning))]">
                      <Webhook className="w-4 h-4" />
                      4. Webhook 模式附加网络回调配置
                    </h3>
                    <p className="text-[10px] text-[hsl(var(--muted))] mt-1">请确保您的物理机器或网络拓扑中对应的回调 Host 与 Port 对外网暴露或可以通过网关映射</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Verification Token</label>
                      <div className="relative flex items-center">
                        <Input
                          type={showVerificationToken ? 'text' : 'password'}
                          value={verificationToken}
                          onChange={(event) => setVerificationToken(event.target.value)}
                          placeholder={feishu?.verificationTokenConfigured ? '•••••••••••••••••••• (留空沿用)' : '输入 verification token'}
                          className="pr-10 font-mono text-xs tracking-wider"
                          onFocus={() => setActiveStep('event')}
                          onBlur={() => setActiveStep(null)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowVerificationToken(!showVerificationToken)}
                          className="absolute right-3 text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 transition-colors"
                        >
                          {showVerificationToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Encrypt Key</label>
                      <div className="relative flex items-center">
                        <Input
                          type={showEncryptKey ? 'text' : 'password'}
                          value={encryptKey}
                          onChange={(event) => setEncryptKey(event.target.value)}
                          placeholder={feishu?.encryptKeyConfigured ? '•••••••••••••••••••• (留空沿用)' : '输入 encrypt key'}
                          className="pr-10 font-mono text-xs tracking-wider"
                          onFocus={() => setActiveStep('event')}
                          onBlur={() => setActiveStep(null)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowEncryptKey(!showEncryptKey)}
                          className="absolute right-3 text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 transition-colors"
                        >
                          {showEncryptKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Webhook Path</label>
                      <Input
                        value={webhookPath}
                        onChange={(event) => setWebhookPath(event.target.value)}
                        className="font-mono text-xs"
                        onFocus={() => setActiveStep('event')}
                        onBlur={() => setActiveStep(null)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Webhook Host</label>
                      <Input
                        value={webhookHost}
                        onChange={(event) => setWebhookHost(event.target.value)}
                        className="font-mono text-xs"
                        onFocus={() => setActiveStep('event')}
                        onBlur={() => setActiveStep(null)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Webhook Port</label>
                      <Input
                        value={webhookPort}
                        onChange={(event) => setWebhookPort(event.target.value)}
                        className="font-mono text-xs"
                        onFocus={() => setActiveStep('event')}
                        onBlur={() => setActiveStep(null)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Guide block (as clean border-dashed block) */}
              <div className="rounded-xl border border-dashed border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-5 flex flex-col gap-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
                  <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
                  飞书接入校验与环境要求
                </span>
                <div className="flex flex-col gap-2.5 text-[11px] leading-relaxed text-[hsl(var(--body))]">
                  <div className="flex items-start gap-2">
                    <span className="text-[hsl(var(--primary))] mt-0.5 font-bold shrink-0">&rarr;</span>
                    <span>在「飞书开放平台」创建自建应用，在<strong>凭证与基础信息</strong>中拷贝 <code>App ID</code> 和 <code>App Secret</code>。</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[hsl(var(--primary))] mt-0.5 font-bold shrink-0">&rarr;</span>
                    <span>在<strong>应用功能 &rarr; 机器人</strong>中开启机器人选项（如果没有开启，客户端长连后无法以机器人身份对话）。</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[hsl(var(--primary))] mt-0.5 font-bold shrink-0">&rarr;</span>
                    <span>在<strong>开发配置 &rarr; 事件订阅</strong>中开启事件订阅，订阅消息权限 <code>im.message.receive_v1</code> (接收消息)。如果使用 WebSocket 模式，须在上方选择<strong>「启用长连接」</strong>。</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[hsl(var(--primary))] mt-0.5 font-bold shrink-0">&rarr;</span>
                    <span>确认在飞书平台对该应用进行「版本发布与上架申请」，通过后机器人在目标群聊或私聊中方可生效。</span>
                  </div>
                </div>
              </div>

              <FeishuDocLinksCard
                appId={appId}
                appSecret={appSecret}
                domain={domain}
                connectionMode={connectionMode}
                verificationToken={verificationToken}
                encryptKey={encryptKey}
                dmPolicy={dmPolicy}
                groupPolicy={groupPolicy}
                allowFrom={allowFrom}
                groupAllowFrom={groupAllowFrom}
                webhookHost={webhookHost}
                webhookPort={webhookPort}
                activeStep={activeStep}
                onOpenUrl={handleOpenUrl}
                onOpenFaq={() => setHelpDialogOpen(true)}
              />
            </div>
          )}

          {feishuSetupResult ? (
            <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] animate-fade-in flex items-start gap-2.5 shadow-2xs">
              <Check className="text-[hsl(var(--success))] w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Feishu 通道配置写入成功！</strong>
                <span>
                  当前服务账号为 `{feishuSetupResult.defaultAccount}`，模式 `{feishuSetupResult.connectionMode}`。您可以在运行控制中心重启 OpenClaw 服务以更新底层通道进程。
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="flex-none pt-4 border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] mt-2 z-10 relative shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        {!isEditing && feishu?.configured ? (
          <Button
            variant="secondary"
            onClick={() => setIsEditing(true)}
            disabled={postInstallActionLoading}
            className="w-full h-11 hover:bg-[hsl(var(--surface-cream-strong))] border-[hsl(var(--hairline))] cursor-pointer font-medium"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            修改渠道接入配置
          </Button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[11px] text-[hsl(var(--muted))] flex items-center gap-2">
              {feishu?.configured ? (
                <>
                  <Check className="w-4 h-4 text-[hsl(var(--success))]" />
                  已存在旧配置，您可以进行二次调整。
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />
                  尚未配置有效的飞书接入凭据。
                </>
              )}
            </div>

            <div className="flex gap-3 flex-1 sm:flex-initial sm:justify-end">
              {feishu?.configured && (
                <Button
                  variant="secondary"
                  disabled={postInstallActionLoading}
                  onClick={() => {
                    resetFormToCurrentStatus();
                    setIsEditing(false);
                  }}
                  className="hover:bg-[hsl(var(--surface-soft))] h-10 px-5 cursor-pointer font-medium"
                >
                  取消
                </Button>
              )}

              <Button
                variant="default"
                disabled={postInstallActionLoading || (effectiveEnabled && !appId.trim())}
                onClick={() =>
                  void onFeishuChannelSetup({
                    configPath: result.configPath,
                    enabled: effectiveEnabled,
                    domain,
                    connectionMode,
                    defaultAccount,
                    accountName,
                    appId,
                    appSecret,
                    dmPolicy,
                    allowFrom: parseCsv(allowFrom),
                    groupPolicy,
                    groupAllowFrom: parseCsv(groupAllowFrom),
                    requireMention,
                    streaming,
                    blockStreaming,
                    typingIndicator,
                    resolveSenderNames,
                    verificationToken,
                    encryptKey,
                    webhookPath,
                    webhookHost,
                    webhookPort: Number.isFinite(Number(webhookPort)) ? Number(webhookPort) : undefined
                  })
                }
                className="flex-1 sm:flex-none min-w-[160px] h-10 bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] cursor-pointer font-medium shadow-sm"
              >
                {feishuSetupLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    正在保存通道配置...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    保存并应用配置
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
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
