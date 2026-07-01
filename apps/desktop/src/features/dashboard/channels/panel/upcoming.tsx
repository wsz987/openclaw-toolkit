import { Check, Heart, Sparkles, Star, ThumbsUp } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import type { ChannelItem } from './model';
import { UPCOMING_CHANNEL_FEATURES } from './model';

type ChannelsUpcomingDetailsProps = {
  channel: ChannelItem;
  voteCount: number;
  hasVoted: boolean;
  onVote: (channelId: string) => void;
};

export function ChannelsUpcomingDetails({
  channel,
  voteCount,
  hasVoted,
  onVote
}: ChannelsUpcomingDetailsProps) {
  const currentFeatures = UPCOMING_CHANNEL_FEATURES[channel.id] || [];

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 animate-fade-in py-2 gap-6">
      <div className="rounded-xl border border-dashed border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.02)] p-5 flex flex-col gap-3 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--primary)/0.03)] rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--primary))]">
            <Star className="w-4 h-4 text-[hsl(var(--primary))]" />
            优先开发此通道
          </h4>
          <p className="text-[10px] text-[hsl(var(--muted))] mt-1">
            该通道目前正在开发规划中。点击下方投票支持，我们会根据投票数量优先排期支持此通道。
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-mono font-bold text-[hsl(var(--body-strong))]">
              {voteCount}
            </div>
            <span className="text-[10px] text-[hsl(var(--muted))] font-medium uppercase tracking-wider block mt-0.5">
              次用户投票支持
            </span>
          </div>
          <Button
            onClick={() => onVote(channel.id)}
            disabled={hasVoted}
            variant={hasVoted ? 'secondary' : 'default'}
            className={`h-9 px-5 font-semibold text-xs transition-all duration-200 cursor-pointer flex items-center gap-2 ${
              hasVoted
                ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.2)]'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))]'
            }`}
          >
            {hasVoted ? (
              <>
                <Check className="w-3.5 h-3.5" />
                已投票支持此通道
              </>
            ) : (
              <>
                <ThumbsUp className="w-3.5 h-3.5" />
                为此通道投票
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-[hsl(var(--body-strong))] tracking-wide flex items-center gap-1.5 px-1">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
          通道特性展望 (Feature Outlook)
        </h3>
        <div className="flex flex-col gap-3">
          {currentFeatures.map((feat) => (
            <div
              key={feat.title}
              className="p-4 rounded-xl bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] flex flex-col gap-1 hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-200"
            >
              <span className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                {feat.title}
              </span>
              <p className="text-[10px] leading-relaxed text-[hsl(var(--muted))]">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))] flex items-start gap-3">
        <Heart className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 flex-shrink-0" />
        <div>
          <strong>想要共同贡献代码？</strong>
          <p className="text-[10px] text-[hsl(var(--muted))] mt-0.5">
            OpenClaw 是一个高度模块化、开源的框架。通道在底层以插件/适配器模式挂载。如果您有开发兴趣，欢迎在代码库中新建适配器，或联系项目组协助排期，我们提供完善的二次开发文档和接口定义规范。
          </p>
        </div>
      </div>
    </div>
  );
}
