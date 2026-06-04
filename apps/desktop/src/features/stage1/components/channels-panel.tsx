import { useEffect, useState } from 'react';
import { MessageSquare, Check, RefreshCw, Shield, Radio, Webhook, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type {
  OpenClawFeishuChannelSetupPayload,
  OpenClawFeishuChannelSetupResult,
  OpenClawPostInstallStatus,
  Stage1InstallResult
} from '../model/types';

type ChannelsPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  statusLoading: boolean;
  feishuSetupLoading: boolean;
  feishuSetupResult: OpenClawFeishuChannelSetupResult | null;
  onFeishuChannelSetup: (input: OpenClawFeishuChannelSetupPayload) => Promise<OpenClawFeishuChannelSetupResult | null>;
};

function parseCsv(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ChannelsPanel({
  result,
  status,
  statusLoading,
  feishuSetupLoading,
  feishuSetupResult,
  onFeishuChannelSetup
}: ChannelsPanelProps) {
  const feishu = status?.feishuChannel;
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

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-5">
        <div>
          <h2 className="font-serif text-2xl font-normal tracking-tight text-[hsl(var(--ink))] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[hsl(var(--primary))]" />
            Channels
          </h2>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted))] mt-1.5">
            当前首期开放 Feishu 内置通道配置。后续可按相同配置式扩展更多内置/可安装渠道。
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border ${
            feishu?.enabled
              ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.2)]'
              : 'bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.2)]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${feishu?.enabled ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--warning))]'}`} />
          {statusLoading ? '状态加载中' : feishu?.enabled ? 'Feishu 已启用' : 'Feishu 未启用'}
        </span>
      </div>

      <Card className="border-[hsl(var(--hairline))]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[hsl(var(--primary))]" />
            Feishu
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[hsl(var(--body-strong))]">启用 Feishu Channel</span>
                <span className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
                  启用后会写入 `plugins.entries.feishu.enabled` 和 `channels.feishu.*`，用于在飞书私聊和群聊中接入 OpenClaw。
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-[hsl(var(--muted))]">
              <div>配置状态：{feishu?.configured ? '已配置凭据' : '尚未完成凭据配置'}</div>
              <div>连接模式：{feishu?.connectionMode ?? 'websocket'}</div>
              <div>默认账号：{feishu?.defaultAccount ?? 'default'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Domain</label>
              <select value={domain} onChange={(event) => setDomain(event.target.value as 'feishu' | 'lark')} className="h-10 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 text-sm">
                <option value="feishu">feishu</option>
                <option value="lark">lark</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Connection Mode</label>
              <select value={connectionMode} onChange={(event) => setConnectionMode(event.target.value as 'websocket' | 'webhook')} className="h-10 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 text-sm">
                <option value="websocket">websocket</option>
                <option value="webhook">webhook</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Default Account</label>
              <Input value={defaultAccount} onChange={(event) => setDefaultAccount(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Account Name</label>
              <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Primary bot" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">App ID</label>
              <Input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="cli_xxx" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">App Secret</label>
              <Input type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder={feishu?.configured ? '留空表示沿用已有密钥' : '输入 Feishu App Secret'} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">DM Policy</label>
              <select value={dmPolicy} onChange={(event) => setDmPolicy(event.target.value as 'allowlist' | 'pairing' | 'open' | 'disabled')} className="h-10 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 text-sm">
                <option value="allowlist">allowlist</option>
                <option value="pairing">pairing</option>
                <option value="open">open</option>
                <option value="disabled">disabled</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Group Policy</label>
              <select value={groupPolicy} onChange={(event) => setGroupPolicy(event.target.value as 'allowlist' | 'open' | 'disabled')} className="h-10 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 text-sm">
                <option value="allowlist">allowlist</option>
                <option value="open">open</option>
                <option value="disabled">disabled</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">DM Allowlist</label>
              <Input value={allowFrom} onChange={(event) => setAllowFrom(event.target.value)} placeholder="ou_xxx, ou_yyy" />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Group Allowlist</label>
              <Input value={groupAllowFrom} onChange={(event) => setGroupAllowFrom(event.target.value)} placeholder="oc_xxx, oc_yyy" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))]">
              <input type="checkbox" checked={requireMention} onChange={(event) => setRequireMention(event.target.checked)} className="mt-1 h-4 w-4" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Require Mention</span>
                <span className="text-[10px] text-[hsl(var(--muted))]">群聊默认要求 @ 机器人后才响应。</span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))]">
              <input type="checkbox" checked={streaming} onChange={(event) => setStreaming(event.target.checked)} className="mt-1 h-4 w-4" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Streaming</span>
                <span className="text-[10px] text-[hsl(var(--muted))]">开启 Feishu 交互卡片流式回复。</span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))]">
              <input type="checkbox" checked={blockStreaming} onChange={(event) => setBlockStreaming(event.target.checked)} className="mt-1 h-4 w-4" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Block Streaming</span>
                <span className="text-[10px] text-[hsl(var(--muted))]">按完成块提前刷新输出。</span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))]">
              <input type="checkbox" checked={typingIndicator} onChange={(event) => setTypingIndicator(event.target.checked)} className="mt-1 h-4 w-4" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Typing Indicator</span>
                <span className="text-[10px] text-[hsl(var(--muted))]">保留输入中提示，增强交互反馈。</span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))] md:col-span-2">
              <input type="checkbox" checked={resolveSenderNames} onChange={(event) => setResolveSenderNames(event.target.checked)} className="mt-1 h-4 w-4" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Resolve Sender Names</span>
                <span className="text-[10px] text-[hsl(var(--muted))]">是否解析用户展示名，关闭后可减少 API 调用。</span>
              </div>
            </label>
          </div>

          {connectionMode === 'webhook' ? (
            <div className="rounded-xl border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.06)] p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--body-strong))]">
                <Webhook className="w-4 h-4 text-[hsl(var(--warning))]" />
                Webhook 模式附加配置
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Verification Token</label>
                  <Input value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} placeholder={feishu?.verificationTokenConfigured ? '留空表示沿用已有值' : '输入 verification token'} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Encrypt Key</label>
                  <Input type="password" value={encryptKey} onChange={(event) => setEncryptKey(event.target.value)} placeholder={feishu?.encryptKeyConfigured ? '留空表示沿用已有值' : '输入 encrypt key'} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Webhook Path</label>
                  <Input value={webhookPath} onChange={(event) => setWebhookPath(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Webhook Host</label>
                  <Input value={webhookHost} onChange={(event) => setWebhookHost(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Webhook Port</label>
                  <Input value={webhookPort} onChange={(event) => setWebhookPort(event.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--success)/0.18)] bg-[hsl(var(--success)/0.06)] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))] flex items-start gap-3">
              <Radio className="w-4 h-4 text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-[hsl(var(--body-strong))]">推荐默认使用 WebSocket。</strong>
                <span> 该模式更接近官方文档默认方式，省掉 webhook 公网回调与验签路径配置，适合你当前桌面安装器的一期实现。</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4 flex flex-col gap-2 text-[11px] leading-relaxed text-[hsl(var(--body))]">
            <div className="flex items-center gap-2 text-[hsl(var(--body-strong))] font-semibold">
              <Shield className="w-4 h-4 text-[hsl(var(--primary))]" />
              接入前检查
            </div>
            <div>1. 在飞书开放平台创建自建应用，并拿到 `App ID / App Secret`。</div>
            <div>2. 开启事件订阅并包含 `im.message.receive_v1`。</div>
            <div>3. 优先选择 persistent connection / WebSocket。</div>
            <div>4. 确认机器人已发布并被拉入目标群。</div>
          </div>

          <div className="flex flex-wrap justify-between gap-4 pt-2 border-t border-[hsl(var(--hairline))]">
            <div className="text-[11px] text-[hsl(var(--muted))] flex items-center gap-2">
              {feishu?.configured ? <Check className="w-4 h-4 text-[hsl(var(--success))]" /> : <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />}
              {feishu?.configured ? '当前已存在凭据，可只修改策略项。' : '当前尚未写入 Feishu 凭据。'}
            </div>
            <Button
              disabled={feishuSetupLoading || !enabled || !appId.trim()}
              onClick={() =>
                void onFeishuChannelSetup({
                  configPath: result.configPath,
                  enabled,
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
              className="min-w-[180px]"
            >
              {feishuSetupLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  正在保存通道配置...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  保存 Feishu 配置
                </>
              )}
            </Button>
          </div>

          {feishuSetupResult ? (
            <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] animate-fade-in flex items-start gap-2.5">
              <Check className="text-[hsl(var(--success))] w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Feishu 通道配置已写入：</strong>
                <span>默认账号 `{feishuSetupResult.defaultAccount}`，连接模式 `{feishuSetupResult.connectionMode}`，可继续从运行控制中心启动 OpenClaw 进行联调。</span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
