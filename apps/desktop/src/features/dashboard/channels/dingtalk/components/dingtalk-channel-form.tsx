import type { ReactNode } from 'react';
import { BookOpen, Eye, EyeOff, Settings2, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../../components/ui/card';
import { Input } from '../../../../../components/ui/input';
import { Select } from '../../../../../components/ui/select';
import { ChannelToggleCard } from '../../panel/shared';
import type { DingtalkChannelFormState } from '../model/dingtalk-channel';
import type { DingtalkChannelStatus } from '../../../../installer/model/types';

type DingtalkChannelFormProps = {
  form: DingtalkChannelFormState;
  status?: DingtalkChannelStatus | null;
  loading: boolean;
  hideEnableToggle?: boolean;
  credentialAssistant?: ReactNode;
  secretVisibility: {
    clientSecret: boolean;
  };
  onFieldChange: <K extends keyof DingtalkChannelFormState>(key: K, value: DingtalkChannelFormState[K]) => void;
  onToggleSecret: (name: 'clientSecret') => void;
};

export function DingtalkChannelForm({
  form,
  status,
  loading,
  hideEnableToggle = false,
  credentialAssistant,
  secretVisibility,
  onFieldChange,
  onToggleSecret
}: DingtalkChannelFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-[hsl(var(--surface-soft))]">
        <CardHeader className="mb-4 border-b border-[hsl(var(--hairline))] p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
            <Settings2 className="h-4 w-4" />
            1. 钉钉通道开关与应用凭据
          </CardTitle>
          <CardDescription>配置钉钉企业内部应用的 Client ID / Client Secret，使用 Stream 模式无需公网 IP</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 p-5 pt-0">
          {!hideEnableToggle ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[hsl(var(--body-strong))]">启用钉钉通道功能 (Enable DingTalk)</span>
                <span className="text-[10px] leading-normal text-[hsl(var(--muted))]">
                  激活后写入对应配置文件，在启动 OpenClaw Runtime 时会自动加载钉钉插件与 Stream 长连接服务。
                </span>
              </div>
              <div
                onClick={() => onFieldChange('enabled', !form.enabled)}
                className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] ${form.enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${form.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Client ID (AppKey)</label>
              <Input
                value={form.clientId}
                onChange={(event) => onFieldChange('clientId', event.target.value)}
                placeholder="ding_xxx / AppKey"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">群聊回复模式 (Group Reply Mode)</label>
              <Select
                value={form.groupReplyMode}
                onChange={(event) =>
                  onFieldChange('groupReplyMode', event.target.value as 'aicard' | 'text' | 'markdown')
                }
              >
                <option value="aicard">AI Card (互动卡片流式响应)</option>
                <option value="markdown">Markdown (富文本消息)</option>
                <option value="text">Text (纯文本消息)</option>
              </Select>
            </div>

            <SecretInput
              className="md:col-span-2"
              label="Client Secret (AppSecret)"
              visible={secretVisibility.clientSecret}
              value={form.clientSecret}
              placeholder={status?.clientSecretConfigured ? '•••••••••••••••••••• (留空表示维持上次的配置)' : '输入钉钉 Client Secret'}
              onChange={(value) => onFieldChange('clientSecret', value)}
              onToggleVisibility={() => onToggleSecret('clientSecret')}
            />
          </div>
        </CardContent>
      </Card>

      {credentialAssistant}

      <Card className="bg-[hsl(var(--surface-soft))]">
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
                onChange={(event) => onFieldChange('dmPolicy', event.target.value as 'open' | 'pairing' | 'allowlist')}
              >
                <option value="open">Open (对所有私聊会话开放响应)</option>
                <option value="allowlist">Allowlist (仅限白名单用户触发)</option>
                <option value="pairing">Pairing (特定配对授权响应)</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">群聊触发策略 (Group Policy)</label>
              <Select
                value={form.groupPolicy}
                onChange={(event) => onFieldChange('groupPolicy', event.target.value as 'open' | 'allowlist' | 'disabled')}
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
                description="配置允许的用户 userId / unionId。支持用英文逗号或换行符分隔。"
                value={form.allowFrom}
                placeholder="userId1, userId2"
                onChange={(value) => onFieldChange('allowFrom', value)}
              />
            ) : null}

            {form.groupPolicy === 'allowlist' ? (
              <WhitelistInput
                className="md:col-span-2"
                label="群聊响应白名单 (Group Allowlist)"
                description="配置允许生效的会话 openConversationId。支持用英文逗号或换行符分隔。"
                value={form.groupAllowFrom}
                placeholder="cid_xxx, cid_yyy"
                onChange={(value) => onFieldChange('groupAllowFrom', value)}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[hsl(var(--surface-soft))]">
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
              description="支持钉钉 AI Card 互动卡片增量刷新。机器人的响应结果将随着生成流渐进渲染，减低等待感。"
              checked={form.streaming}
              onChange={(value) => onFieldChange('streaming', value)}
            />
            <ChannelToggleCard
              label="正在输入指示 (Typing Indicator)"
              description="在处理大模型耗时请求的过程中，卡片将常驻“思考中/生成中”状态，提升会话动效反馈。"
              checked={form.typingIndicator}
              onChange={(value) => onFieldChange('typingIndicator', value)}
            />
            <ChannelToggleCard
              label="反解发送者实名 (Resolve Sender Names)"
              description="是否在日志与事件中将 userId 解析为清晰的用户真实展示姓名，会额外进行一次钉钉 API 查询。"
              checked={form.resolveSenderNames}
              onChange={(value) => onFieldChange('resolveSenderNames', value)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>
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
