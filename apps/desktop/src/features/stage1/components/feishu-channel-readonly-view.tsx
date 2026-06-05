import { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Hash,
  Radio,
  Settings2,
  Shield,
  Webhook
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import type { FeishuChannelStatus } from '../model/types';

type FeishuChannelReadonlyViewProps = {
  feishu: FeishuChannelStatus;
};

export function FeishuChannelReadonlyView({ feishu }: FeishuChannelReadonlyViewProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => setCopiedText(null), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="transition-all duration-300 hover:border-[hsl(var(--muted-soft))/0.5]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-3 text-[hsl(var(--primary))] shadow-2xs">
              <Radio className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">
                服务通道类型
              </span>
              <strong className="mt-0.5 block truncate text-base font-medium capitalize text-[hsl(var(--body-strong))]">
                {feishu.domain || 'feishu'} ({feishu.connectionMode || 'websocket'})
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:border-[hsl(var(--muted-soft))/0.5]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Hash className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">
                Bot App ID
              </span>
              <div className="mt-0.5 flex items-center gap-2">
                <strong className="truncate font-mono text-sm font-medium text-[hsl(var(--body-strong))]">
                  {feishu.appId || '未配置'}
                </strong>
                {feishu.appId ? (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(feishu.appId || '')}
                    className="cursor-pointer rounded p-1 text-[hsl(var(--muted-soft))] transition-all hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--ink))]"
                    title="复制 App ID"
                  >
                    {copiedText === feishu.appId ? (
                      <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:border-[hsl(var(--muted-soft))/0.5]">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-xl bg-purple-100 p-3 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
              <Settings2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">
                账号与昵称
              </span>
              <strong className="mt-0.5 block truncate text-sm font-medium text-[hsl(var(--body-strong))]">
                {feishu.accountName || '未命名'} ({feishu.defaultAccount || 'default'})
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
              私聊安全策略 (DM Policy)
            </CardTitle>
            <CardDescription>控制单聊对话中机器人的安全响应机制</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-5 pt-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[hsl(var(--muted))]">当前策略:</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  feishu.dmPolicy === 'open'
                    ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]'
                    : feishu.dmPolicy === 'allowlist'
                      ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400'
                      : feishu.dmPolicy === 'pairing'
                        ? 'border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-400'
                        : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400'
                }`}
              >
                {feishu.dmPolicy || 'disabled'}
              </span>
            </div>
            {feishu.dmPolicy === 'allowlist' ? (
              <WhitelistSection title="允许私聊的 User ID" values={feishu.allowFrom} emptyLabel="空（未添加任何 ID）" />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
              群聊安全策略 (Group Policy)
            </CardTitle>
            <CardDescription>限制机器人在飞书群聊中的事件分发</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-5 pt-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[hsl(var(--muted))]">当前策略:</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  feishu.groupPolicy === 'open'
                    ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]'
                    : feishu.groupPolicy === 'allowlist'
                      ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400'
                      : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400'
                }`}
              >
                {feishu.groupPolicy || 'disabled'}
              </span>
            </div>
            {feishu.groupPolicy === 'allowlist' ? (
              <WhitelistSection
                title="允许的飞书群聊 Chat ID"
                values={feishu.groupAllowFrom}
                emptyLabel="空（未添加任何 ID）"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-5 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-[hsl(var(--primary))]" />
            交互特性与细节状态
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <FeatureSummary
              label="群聊被提及 (@)"
              enabled={feishu.requireMention}
              enabledLabel="必须艾特"
              disabledLabel="直接响应"
            />
            <FeatureSummary
              label="流式卡片回复"
              enabled={feishu.streaming}
              enabledLabel={`流式 (${feishu.blockStreaming ? '分块' : '卡片'})`}
              disabledLabel="标准卡片"
            />
            <FeatureSummary label="输入状态指示器" enabled={feishu.typingIndicator} enabledLabel="已启用" disabledLabel="无状态" />
            <FeatureSummary label="解析发送者姓名" enabled={feishu.resolveSenderNames} enabledLabel="自动获取" disabledLabel="隐藏" />
          </div>

          {feishu.connectionMode === 'webhook' ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-[hsl(var(--warning)/0.18)] bg-[hsl(var(--warning)/0.03)] p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--warning))]">
                <Webhook className="h-3.5 w-3.5" />
                Webhook 模式详细参数
              </div>
              <div className="grid grid-cols-1 gap-3 font-mono text-[10px] text-[hsl(var(--body))] sm:grid-cols-3">
                <div>事件路由: {feishu.webhookPath || '/feishu/events'}</div>
                <div>绑定Host: {feishu.webhookHost || '127.0.0.1'}</div>
                <div>绑定端口: {feishu.webhookPort || '3000'}</div>
                <div>签名校验 Token: {feishu.verificationTokenConfigured ? '•••••••• (已写入)' : '未配置'}</div>
                <div>加密 Key: {feishu.encryptKeyConfigured ? '•••••••• (已写入)' : '未配置'}</div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {feishu.connectionMode === 'websocket' ? (
        <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--success)/0.18)] bg-[hsl(var(--success)/0.04)] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))]">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--success))]" />
          <div>
            <strong>WebSocket 长连接配置正常。</strong>
            <span>
              不需要在公网暴露回调端口，OpenClaw 会与飞书服务器保持持久通信。如果遇到通道无法接收消息，请确认您已在飞书平台开启了「长连接订阅方式」并在控制台部署了机器人。
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeatureSummary({
  label,
  enabled,
  enabledLabel,
  disabledLabel
}: {
  label: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-r border-[hsl(var(--hairline))] pr-4 last:border-r-0 last:pr-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">{label}</span>
      <strong className="mt-1 flex items-center gap-1 text-xs font-semibold text-[hsl(var(--body-strong))]">
        {enabled ? (
          <>
            <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
            {enabledLabel}
          </>
        ) : (
          disabledLabel
        )}
      </strong>
    </div>
  );
}

function WhitelistSection({
  title,
  values,
  emptyLabel
}: {
  title: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-[hsl(var(--hairline))] pt-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">{title}</span>
      {values.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {values.map((id) => (
            <span
              key={id}
              className="rounded border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] px-2 py-0.5 font-mono text-[9px]"
            >
              {id}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs italic text-[hsl(var(--muted))]">{emptyLabel}</span>
      )}
    </div>
  );
}
