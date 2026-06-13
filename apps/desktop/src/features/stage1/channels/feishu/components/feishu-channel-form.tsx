import type { ReactNode } from 'react';
import { BookOpen, Eye, EyeOff, Radio, Settings2, Shield, Webhook } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../../components/ui/card';
import { Input } from '../../../../../components/ui/input';
import { Select } from '../../../../../components/ui/select';
import { ChannelToggleCard } from '../../panel/shared';
import { getFeishuPlatformLabel } from '../model/feishu-channel';
import type { FeishuChannelFormState } from '../model/feishu-channel';
import type { FeishuChannelStatus } from '../../../model/types';

type FeishuChannelFormProps = {
  form: FeishuChannelFormState;
  status?: FeishuChannelStatus | null;
  loading: boolean;
  hideEnableToggle?: boolean;
  secretVisibility: {
    appSecret: boolean;
    verificationToken: boolean;
    encryptKey: boolean;
  };
  onFieldChange: <K extends keyof FeishuChannelFormState>(key: K, value: FeishuChannelFormState[K]) => void;
  onToggleSecret: (name: 'appSecret' | 'verificationToken' | 'encryptKey') => void;
};

export function FeishuChannelForm({
  form,
  status,
  loading,
  hideEnableToggle = false,
  secretVisibility,
  onFieldChange,
  onToggleSecret
}: FeishuChannelFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="mb-4 border-b border-[hsl(var(--hairline))] p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
          <Settings2 className="h-4 w-4" />
          1. 飞书通道开关与连接基本凭据
        </CardTitle>
        <CardDescription>配置您的飞书自建应用对接参数以拉起核心通道连接</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 pt-0">
        {!hideEnableToggle ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-[hsl(var(--body-strong))]">启用飞书通道功能 (Enable Feishu)</span>
              <span className="text-[10px] leading-normal text-[hsl(var(--muted))]">
                激活后写入对应配置文件，在启动 OpenClaw Runtime 时会自动加载飞书插件与长连接服务。
              </span>
            </div>
            <div
              onClick={() => onFieldChange('enabled', !form.enabled)}
              className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] ${
                form.enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  form.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">平台区域</label>
              <Select value={form.domain} onChange={(event) => onFieldChange('domain', event.target.value as 'feishu' | 'lark')}>
                <option value="feishu">{getFeishuPlatformLabel('feishu')}</option>
                <option value="lark">{getFeishuPlatformLabel('lark')}</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">App ID</label>
              <Input
                value={form.appId}
                onChange={(event) => onFieldChange('appId', event.target.value)}
                placeholder="cli_xxx"
                className="font-mono text-xs"
              />
            </div>

            <SecretInput
              className="md:col-span-2"
              label="App Secret"
              visible={secretVisibility.appSecret}
              value={form.appSecret}
              placeholder={status?.configured ? '•••••••••••••••••••• (留空表示维持上次的配置)' : '输入飞书 App Secret'}
              onChange={(value) => onFieldChange('appSecret', value)}
              onToggleVisibility={() => onToggleSecret('appSecret')}
            />
          </div>

          <div className="mt-2 flex flex-col gap-2.5">
            <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">连接模式 (Connection Mode)</label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ConnectionModeCard
                icon={<Radio className={`h-4 w-4 ${form.connectionMode === 'websocket' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted))]'}`} />}
                active={form.connectionMode === 'websocket'}
                title="WebSocket 长连接模式"
                description="无需公网域名，本地开发直接长连官方事件流，避开网络反向代理及事件订阅验签，最适合桌面客户端。"
                badge="推荐模式"
                onClick={() => onFieldChange('connectionMode', 'websocket')}
              />
              <ConnectionModeCard
                icon={<Webhook className={`h-4 w-4 ${form.connectionMode === 'webhook' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted))]'}`} />}
                active={form.connectionMode === 'webhook'}
                title="Webhook 回调函数模式"
                description="传统 Webhook 架构。需要配置公网回调地址和验签 Token，适合在云端容器或生产服务器长期托管时使用。"
                onClick={() => onFieldChange('connectionMode', 'webhook')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-[hsl(var(--hairline))] pt-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">账户昵称 (Account Name)</label>
              <Input
                value={form.accountName}
                onChange={(event) => onFieldChange('accountName', event.target.value)}
                placeholder="Primary bot"
                className="text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="mb-4 border-b border-[hsl(var(--hairline))] p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
            <Shield className="h-4 w-4" />
            2. 消息接入控制与安全白名单策略
          </CardTitle>
          <CardDescription>限制与规范私聊及群聊的调用条件，防止意外交互或资源耗尽</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">私聊触发策略 (DM Policy)</label>
              <Select
                value={form.dmPolicy}
                onChange={(event) =>
                  onFieldChange('dmPolicy', event.target.value as 'allowlist' | 'pairing' | 'open' | 'disabled')
                }
              >
                <option value="open">Open (对所有私聊会话开放响应)</option>
                <option value="allowlist">Allowlist (仅限白名单用户触发)</option>
                <option value="pairing">Pairing (特定配对授权响应)</option>
                <option value="disabled">Disabled (禁用单聊响应)</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">群聊触发策略 (Group Policy)</label>
              <Select
                value={form.groupPolicy}
                onChange={(event) => onFieldChange('groupPolicy', event.target.value as 'allowlist' | 'open' | 'disabled')}
              >
                <option value="open">Open (支持在所有群中艾特响应)</option>
                <option value="allowlist">Allowlist (仅限白名单群聊生效)</option>
                <option value="disabled">Disabled (群聊场景静默不响应)</option>
              </Select>
            </div>

            {form.dmPolicy === 'allowlist' ? (
              <WhitelistInput
                className="md:col-span-2"
                label="私聊响应白名单 (DM Allowlist)"
                description="配置允许的用户 Open ID。支持用英文逗号或换行符分隔。"
                value={form.allowFrom}
                placeholder="ou_xxx, ou_yyy"
                onChange={(value) => onFieldChange('allowFrom', value)}
              />
            ) : null}

            {form.groupPolicy === 'allowlist' ? (
              <WhitelistInput
                className="md:col-span-2"
                label="群聊响应白名单 (Group Allowlist)"
                description="配置允许生效的 Chat ID。支持用英文逗号或换行符分隔。"
                value={form.groupAllowFrom}
                placeholder="oc_xxx, oc_yyy"
                onChange={(value) => onFieldChange('groupAllowFrom', value)}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="mb-4 border-b border-[hsl(var(--hairline))] p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
            <BookOpen className="h-4 w-4" />
            3. 交互特性与高级呈现选项
          </CardTitle>
          <CardDescription>自定义机器人在会话交互中的回复呈现和卡片渲染参数</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChannelToggleCard
              label="群聊限定提及 (@ Mention)"
              description="开启后在群中只有被显式 @ 的消息才会唤醒机器人。关闭后机器人可接收并解析群内所有公开消息。"
              checked={form.requireMention}
              onChange={(value) => onFieldChange('requireMention', value)}
            />
            <ChannelToggleCard
              label="流式内容输出 (Streaming)"
              description="支持飞书动态卡片增量刷新。机器人的响应结果将随着生成流渐进渲染，减低等待感。"
              checked={form.streaming}
              onChange={(value) => onFieldChange('streaming', value)}
            />
            {form.streaming ? (
              <ChannelToggleCard
                label="分块延迟提交 (Block Streaming)"
                description="当输出段落/列表完成时才向飞书卡片提交修改，可大幅度减缓飞书在流式长回答下的卡片闪烁。"
                checked={form.blockStreaming}
                onChange={(value) => onFieldChange('blockStreaming', value)}
              />
            ) : null}
            <ChannelToggleCard
              label="正在输入指示 (Typing Indicator)"
              description="在处理大模型耗时请求的过程中，聊天窗口顶部将常驻“机器人在输入中”状态，提升会话动效反馈。"
              checked={form.typingIndicator}
              onChange={(value) => onFieldChange('typingIndicator', value)}
            />
            <ChannelToggleCard
              label="反解发送者实名 (Resolve Sender Names)"
              description="是否在日志与事件中将加密的 Open ID 解析为清晰的用户真实展示姓名，会额外进行一次飞书 API 查询。"
              checked={form.resolveSenderNames}
              onChange={(value) => onFieldChange('resolveSenderNames', value)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {form.connectionMode === 'webhook' ? (
        <Card className="border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning)/0.02)]">
          <CardHeader className="mb-4 border-b border-[hsl(var(--warning)/0.15)] p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--warning))]">
              <Webhook className="h-4 w-4" />
              4. Webhook 模式附加网络回调配置
            </CardTitle>
            <CardDescription className="text-[hsl(var(--warning)/0.8)]">
              请确保您的物理机器或网络拓扑中对应的回调 Host 与 Port 对外网暴露或可以通过网关映射
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5 pt-0">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SecretInput
                label="Verification Token"
                visible={secretVisibility.verificationToken}
                value={form.verificationToken}
                placeholder={status?.verificationTokenConfigured ? '•••••••••••••••••••• (留空沿用)' : '输入 verification token'}
                onChange={(value) => onFieldChange('verificationToken', value)}
                onToggleVisibility={() => onToggleSecret('verificationToken')}
              />
              <SecretInput
                label="Encrypt Key"
                visible={secretVisibility.encryptKey}
                value={form.encryptKey}
                placeholder={status?.encryptKeyConfigured ? '•••••••••••••••••••• (留空沿用)' : '输入 encrypt key'}
                onChange={(value) => onFieldChange('encryptKey', value)}
                onToggleVisibility={() => onToggleSecret('encryptKey')}
              />
              <TextField label="Webhook Path" value={form.webhookPath} onChange={(value) => onFieldChange('webhookPath', value)} mono />
              <TextField label="Webhook Host" value={form.webhookHost} onChange={(value) => onFieldChange('webhookHost', value)} mono />
              <TextField
                className="md:col-span-2"
                label="Webhook Port"
                value={form.webhookPort}
                onChange={(value) => onFieldChange('webhookPort', value)}
                mono
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ConnectionModeCard({
  active,
  badge,
  description,
  icon,
  onClick,
  title
}: {
  active: boolean;
  badge?: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex cursor-pointer select-none flex-col gap-2 rounded-xl border-2 p-4 transition-all duration-200 ${
        active
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] shadow-2xs'
          : 'border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:border-[hsl(var(--muted-soft))]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--ink))]">
          {icon}
          {title}
        </span>
        {badge && active ? (
          <span className="rounded-full bg-[hsl(var(--primary)/0.08)] px-2 py-0.5 text-[9px] font-semibold text-[hsl(var(--primary))]">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-[10px] leading-relaxed text-[hsl(var(--muted))]">{description}</p>
    </div>
  );
}

function SecretInput({
  className,
  label,
  onChange,
  onToggleVisibility,
  placeholder,
  value,
  visible
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  placeholder: string;
  value: string;
  visible: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`.trim()}>
      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">{label}</label>
      <div className="relative flex items-center">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-xs tracking-wider"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-3 cursor-pointer p-1 text-[hsl(var(--muted-soft))] transition-colors hover:text-[hsl(var(--ink))]"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function TextField({
  className,
  label,
  mono = false,
  onChange,
  value
}: {
  className?: string;
  label: string;
  mono?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`.trim()}>
      <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className={mono ? 'font-mono text-xs' : undefined} />
    </div>
  );
}

function WhitelistInput({
  className,
  description,
  label,
  onChange,
  placeholder,
  value
}: {
  className?: string;
  description: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={`animate-fade-in flex flex-col gap-1.5 ${className ?? ''}`.trim()}>
      <label className="flex items-center justify-between text-xs font-semibold text-[hsl(var(--body-strong))]">
        <span>{label}</span>
        <span className="text-[10px] text-[hsl(var(--muted))]">{description}</span>
      </label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="font-mono text-xs" />
    </div>
  );
}
