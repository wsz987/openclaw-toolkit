import { Eye, EyeOff, Info, KeyRound, LockKeyhole, MessageCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { QqbotChannelStatus } from '@/openclaw/model/types';
import type { QqbotChannelFormState } from '../model/qqbot-channel';

type QqbotChannelFormProps = {
  form: QqbotChannelFormState;
  status: QqbotChannelStatus | null;
  loading: boolean;
  hideEnableToggle?: boolean;
  secretVisible: boolean;
  onFieldChange: <K extends keyof QqbotChannelFormState>(key: K, value: QqbotChannelFormState[K]) => void;
  onToggleSecret: () => void;
};

export function QqbotChannelForm({
  form,
  status,
  loading,
  hideEnableToggle = false,
  secretVisible,
  onFieldChange,
  onToggleSecret
}: QqbotChannelFormProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-5 shadow-2xs">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--body-strong))]">
            <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
            QQ Bot 凭证与策略
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            在 QQ 开放平台机器人页面复制 AppID 与 AppSecret 后填入。AppSecret 离开页面后通常不可再次明文查看，请妥善保存。
          </p>
        </div>
        {!hideEnableToggle ? (
          <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted))]">
            <span>{form.enabled ? '启用' : '关闭'}</span>
            <Switch checked={form.enabled} disabled={loading} onCheckedChange={(checked) => onFieldChange('enabled', checked)} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          AppID
          <Input
            value={form.appId}
            disabled={loading}
            placeholder="例如 1020xxxxxx"
            onChange={(event) => onFieldChange('appId', event.target.value)}
            className="h-10 bg-[hsl(var(--canvas))] text-sm"
          />
          {status?.appId ? <span className="text-[10px] text-[hsl(var(--muted))]">当前已保存 AppID：{status.appId}</span> : null}
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          AppSecret
          <div className="relative">
            <Input
              value={form.clientSecret}
              disabled={loading}
              type={secretVisible ? 'text' : 'password'}
              placeholder={status?.clientSecretConfigured ? '留空则保留已保存的 AppSecret' : '粘贴 AppSecret'}
              onChange={(event) => onFieldChange('clientSecret', event.target.value)}
              className="h-10 bg-[hsl(var(--canvas))] pr-10 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={loading}
              className="absolute right-1 top-1 h-8 w-8"
              onClick={onToggleSecret}
            >
              {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <span className="text-[10px] text-[hsl(var(--muted))]">
            {status?.clientSecretConfigured ? '已保存 AppSecret；不填写新值会继续沿用。' : '尚未保存 AppSecret。'}
          </span>
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          <span className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> 私聊策略</span>
          <Select value={form.dmPolicy} disabled={loading} onChange={(event) => onFieldChange('dmPolicy', event.target.value as QqbotChannelFormState['dmPolicy'])}>
            <option value="open">开放（允许所有私聊）</option>
            <option value="pairing">配对模式</option>
            <option value="allowlist">白名单</option>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          私聊白名单 allowFrom
          <Input
            value={form.allowFrom}
            disabled={loading}
            placeholder="* 或 openid，多个用逗号分隔"
            onChange={(event) => onFieldChange('allowFrom', event.target.value)}
            className="h-10 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> 群聊策略</span>
          <Select value={form.groupPolicy} disabled={loading} onChange={(event) => onFieldChange('groupPolicy', event.target.value as QqbotChannelFormState['groupPolicy'])}>
            <option value="open">开放（允许所有群）</option>
            <option value="allowlist">白名单</option>
            <option value="disabled">禁用群聊</option>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          群聊白名单 groupAllowFrom
          <Input
            value={form.groupAllowFrom}
            disabled={loading}
            placeholder="群 openid，多个用逗号分隔"
            onChange={(event) => onFieldChange('groupAllowFrom', event.target.value)}
            className="h-10 text-sm"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.35] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--body-strong))]">
              <LockKeyhole className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
              群聊默认仅 @ 时回复
            </div>
            <p className="mt-1 text-[10px] text-[hsl(var(--muted))]">关闭后，AI 会自主判断是否需要在群内发言。</p>
          </div>
          <Switch
            checked={form.defaultRequireMention}
            disabled={loading}
            onCheckedChange={(checked) => onFieldChange('defaultRequireMention', checked)}
          />
        </div>

        <label className="flex flex-col gap-1.5 text-[11px] font-medium text-[hsl(var(--body-strong))]">
          传输模式
          <Select value={form.transport} disabled={loading} onChange={(event) => onFieldChange('transport', event.target.value as QqbotChannelFormState['transport'])}>
            <option value="websocket">WebSocket（推荐，无需公网 IP）</option>
            <option value="webhook">Webhook（需要公网回调地址）</option>
          </Select>
        </label>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--primary)/0.04)] px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))]">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--primary))]" />
        WebSocket 模式适合本地桌面客户端；Webhook 模式需在 QQ 开放平台「开发设置 - 消息接收方式」配置公网回调 URL。
      </div>
    </div>
  );
}
