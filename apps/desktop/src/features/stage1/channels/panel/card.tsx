import { ChevronRight, Loader2, Settings, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { getChannelIcon } from './icons';
import type { ChannelActionState, ChannelItem } from './model';
import type { ChannelController } from '../../channels/shared/model/channel-controller';

type ChannelListSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

function ChannelListSwitch({
  checked,
  disabled,
  loading,
  label,
  onChange
}: ChannelListSwitchProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={checked ? `关闭${label}通道` : `启用${label}通道`}
      disabled={disabled || loading}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled || loading) {
          return;
        }
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
        checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
      } ${(disabled || loading) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin text-[hsl(var(--primary))]" /> : null}
      </span>
    </button>
  );
}

type ChannelsPanelCardProps = {
  channel: ChannelItem;
  controller?: ChannelController | null;
  actionState?: ChannelActionState;
  voteCount: number;
  onCardClick: () => void;
  onToggle: (checked: boolean) => void;
  onRequestUninstall: () => void;
};

export function ChannelsPanelCard({
  channel,
  controller,
  actionState,
  voteCount,
  onCardClick,
  onToggle,
  onRequestUninstall
}: ChannelsPanelCardProps) {
  const resolvedController = controller ?? null;

  return (
    <div
      onClick={() => {
        if (resolvedController?.loading) {
          return;
        }
        onCardClick();
      }}
      className={`group rounded-xl border border-[hsl(var(--hairline))] bg-gradient-to-br from-[hsl(var(--surface-card))] to-[hsl(var(--surface-soft))/0.3] p-5 flex flex-col justify-between gap-4 transition-all duration-300 relative overflow-hidden ${
        resolvedController?.loading
          ? 'animate-pulse opacity-80 border-[hsl(var(--primary)/0.25)]'
          : 'hover:border-[hsl(var(--primary)/0.25)] hover:shadow-md cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="shrink-0 transition-transform group-hover:scale-105">
          {getChannelIcon(channel.iconName, 'w-6 h-6')}
        </div>
        <div className="flex items-center gap-2">
          {resolvedController ? (
            <ChannelListSwitch
              label={channel.name}
              checked={Boolean(resolvedController.enabled)}
              disabled={resolvedController.loading}
              loading={resolvedController.loading}
              onChange={onToggle}
            />
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--muted)/0.06)] text-[hsl(var(--muted))] border-[hsl(var(--hairline))]">
              规划中
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 flex-1">
        <span className="font-serif text-base font-semibold text-[hsl(var(--ink))] group-hover:text-[hsl(var(--primary))] transition-colors duration-200">
          {channel.name}
        </span>
        <span className="text-[9px] font-mono text-[hsl(var(--muted-soft))] uppercase tracking-wider">
          {channel.type}
        </span>
        <p className="text-xs leading-relaxed text-[hsl(var(--body))] mt-1.5 line-clamp-3">
          {channel.description}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-[hsl(var(--muted-soft))]/50 pt-3 mt-auto">
        {resolvedController ? (
          resolvedController.loading ? (
            <span className="text-[10px] text-[hsl(var(--primary))] font-semibold flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在检测...
            </span>
          ) : (
            <span className="text-[10px] text-[hsl(var(--primary))] font-semibold flex items-center gap-0.5">
              <Settings className="w-3.5 h-3.5" />
              配置通道
            </span>
          )
        ) : (
          <span className="text-[10px] text-[hsl(var(--muted-soft))] font-medium flex items-center gap-1">
            <ThumbsUp className="w-3 h-3 text-[hsl(var(--primary))]" />
            支持投票 ({voteCount} 票)
          </span>
        )}
        <div className="flex items-center">
          {actionState?.pluginInstalled && actionState.onPluginUninstall ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`卸载 ${channel.name} 插件`}
              title={`卸载 ${channel.name} 插件`}
              disabled={actionState.pluginInstalling || actionState.pluginUninstalling || resolvedController?.loading}
              onClick={(event) => {
                event.stopPropagation();
                onRequestUninstall();
              }}
              className="h-7 w-7 text-[hsl(var(--muted))] hover:text-[hsl(var(--error))] hover:bg-[hsl(var(--error)/0.06)] transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-soft))] group-hover:text-[hsl(var(--primary))] transition-colors group-hover:translate-x-0.5 duration-200" />
        </div>
      </div>
    </div>
  );
}
