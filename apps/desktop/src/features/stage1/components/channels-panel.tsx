import { useState } from 'react';
import {
  MessageSquare,
  Send,
  MessageCircle,
  Webhook,
  Search,
  ThumbsUp,
  Sparkles,
  Check,
  Star,
  Clock,
  Heart,
  X,
  ChevronRight,
  Settings,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { FeishuPluginPanel, type FeishuPluginPanelProps } from '../plugins/feishu/components/feishu-plugin-panel';

export type ChannelsPanelProps = FeishuPluginPanelProps;

type ChannelItem = {
  id: string;
  name: string;
  type: string;
  iconName: 'feishu' | 'telegram' | 'slack' | 'wechat' | 'dingtalk' | 'webhook';
  description: string;
  isUpcoming: boolean;
  colorClass: string;
  badgeBg: string;
  badgeText: string;
};

const CHANNELS_LIST: ChannelItem[] = [
  {
    id: 'feishu',
    name: '飞书 / Lark',
    type: '内置官方通道',
    iconName: 'feishu',
    description: '支持对接飞书自建应用，包含私聊和群聊。支持 WebSocket 和 Webhook 模式。',
    isUpcoming: false,
    colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-500'
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    type: '扩展通道 (规划中)',
    iconName: 'telegram',
    description: '通过 Telegram Bot API 对接，支持接收/回复个人会话及频道群组消息。',
    isUpcoming: true,
    colorClass: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    badgeBg: 'bg-sky-500/10 border border-sky-500/20',
    badgeText: 'text-sky-500'
  },
  {
    id: 'slack',
    name: 'Slack Bot',
    type: '扩展通道 (规划中)',
    iconName: 'slack',
    description: '对接 Slack App，将 OpenClaw 的智能体连接至 Slack 频道 and DM。',
    isUpcoming: true,
    colorClass: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
    badgeBg: 'bg-pink-500/10 border border-pink-500/20',
    badgeText: 'text-pink-500'
  },
  {
    id: 'wechat',
    name: '企业微信 (WeCom)',
    type: '高级通道 (规划中)',
    iconName: 'wechat',
    description: '对接企业微信自建应用，实现内部智能助手或外部客户群组管理。',
    isUpcoming: true,
    colorClass: 'text-green-500 bg-green-500/10 border-green-500/20',
    badgeBg: 'bg-green-500/10 border border-green-500/20',
    badgeText: 'text-green-500'
  },
  {
    id: 'dingtalk',
    name: '钉钉 (DingTalk)',
    type: '内置通道 (规划中)',
    iconName: 'dingtalk',
    description: '对接钉钉单聊及群聊机器人，支持流式交互卡片 and 快捷菜单。',
    isUpcoming: true,
    colorClass: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    badgeBg: 'bg-orange-500/10 border border-orange-500/20',
    badgeText: 'text-orange-500'
  },
  {
    id: 'webhook',
    name: '自定义 Webhook',
    type: '开发者接口 (规划中)',
    iconName: 'webhook',
    description: '提供通用的 HTTP 请求/响应接口规范，支持连接任意第三方聊天系统。',
    isUpcoming: true,
    colorClass: 'text-slate-500 bg-slate-500/10 border-slate-500/20',
    badgeBg: 'bg-slate-500/10 border border-slate-500/20',
    badgeText: 'text-slate-500'
  }
];

// Brand SVG Components for Channels
function FeishuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M20.25 7.5L12 12.5l2.25 7.25L20.25 7.5z" fill="#00A3FF" />
      <path d="M12 12.5L3.75 7.5L9.75 19.75L12 12.5z" fill="#36CCA8" />
      <path d="M12 12.5l2.25 7.25-2.25 3-2.25-3 2.25-7.25z" fill="#0066FF" />
      <path d="M12 12.5L3.75 7.5h16.5L12 12.5z" fill="#00C2FF" />
    </svg>
  );
}

function TelegramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="11.5" fill="#26A5E4" stroke="#26A5E4" />
      <path d="M17.15 8.27l-2.45 11.5c-.17.78-.63.97-1.29.6l-3.73-2.75-1.8 1.73c-.2.2-.36.37-.74.37l.27-3.79 6.9-6.22c.3-.27-.07-.42-.47-.15L6.5 14.86l-3.67-1.15c-.8-.25-.81-.8.17-1.18L17.2 4.95c.65-.25 1.25.16.95 1.48" fill="#FFF" />
    </svg>
  );
}

function SlackIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#36C5F0" />
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.527 2.527 0 0 1 2.522 2.522v2.52h-2.52zm0 3.793a2.527 2.527 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 6.313 0a2.521 2.522v6.313z" fill="#2EB67D" />
      <path d="M15.165 8.835a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 20.21 8.835a2.527 2.527 0 0 1-2.523 2.521h-2.522v-2.521zm0-6.313a2.527 2.527 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V0a2.528 2.528 0 0 1 2.521-2.522A2.528 2.528 0 0 1 15.165 0v2.522z" fill="#ECB22E" />
      <path d="M15.165 18.958a2.527 2.527 0 0 1 2.522 2.521 2.527 2.527 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521v-2.521h2.521zm0-3.793a2.527 2.527 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V8.835a2.528 2.528 0 0 1 2.521-2.522a2.528 2.528 0 0 1 2.521 2.522v6.313z" fill="#E01E5A" />
    </svg>
  );
}

function WeComIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" fill="#1E88E5" />
      <circle cx="5.785" cy="7.17" r="1.162" fill="#FFF" />
      <circle cx="11.598" cy="7.17" r="1.162" fill="#FFF" />
      <path d="M17.344 8.86c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088z" fill="#1565C0" />
      <circle cx="14.814" cy="12.98" r="0.969" fill="#FFF" />
      <circle cx="19.658" cy="12.98" r="0.969" fill="#FFF" />
    </svg>
  );
}

function DingTalkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="24" height="24" rx="5" fill="#007FFF" />
      <path d="M6.5 6.5l8.5 3.2a1 1 0 0 1 .6 1.3l-1.3 2.7H16l-6 4.8 1.2-4.8c-3.7.03-3.7-3.7-4.7-7.2z" fill="#FFF" />
    </svg>
  );
}

function WebhookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="24" height="24" rx="5" fill="#475569" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7.75 7.75l2.83 2.83M13.41 13.41l2.83 2.83M7.75 16.25l2.83-2.83M13.41 10.59l2.83-2.83" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" fill="#FFF" />
    </svg>
  );
}

function getChannelIcon(iconName: string, className?: string) {
  switch (iconName) {
    case 'feishu':
      return <FeishuIcon className={className} />;
    case 'telegram':
      return <TelegramIcon className={className} />;
    case 'slack':
      return <SlackIcon className={className} />;
    case 'wechat':
      return <WeComIcon className={className} />;
    case 'dingtalk':
      return <DingTalkIcon className={className} />;
    case 'webhook':
      return <WebhookIcon className={className} />;
    default:
      return <MessageSquare className={className} />;
  }
}

export function ChannelsPanel(props: ChannelsPanelProps) {
  const [activeChannelId, setActiveChannelId] = useState<string>('feishu');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'configured' | 'upcoming'>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [votes, setVotes] = useState<Record<string, number>>({
    telegram: 42,
    slack: 28,
    wechat: 35,
    dingtalk: 19,
    webhook: 15
  });
  const [hasVoted, setHasVoted] = useState<Record<string, boolean>>({});

  const handleVote = (channelId: string) => {
    if (hasVoted[channelId]) {
      toast.warning('您已经为该通道投过票了！');
      return;
    }
    setVotes((prev) => ({
      ...prev,
      [channelId]: prev[channelId] + 1
    }));
    setHasVoted((prev) => ({
      ...prev,
      [channelId]: true
    }));
    const channelName = CHANNELS_LIST.find((c) => c.id === channelId)?.name || '';
    toast.success(`投票成功！感谢您支持优先开发 ${channelName} 通道。`);
  };

  const filteredChannels = CHANNELS_LIST.filter((channel) => {
    // 1. Search filter
    const matchesSearch =
      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Tab filter
    if (activeTab === 'configured') {
      if (channel.id === 'feishu') {
        const isFeishuConfigured = props.status?.feishuChannel?.configured || props.status?.feishuChannel?.enabled;
        return isFeishuConfigured;
      }
      return false;
    }
    if (activeTab === 'upcoming') {
      return channel.isUpcoming;
    }

    return true;
  });

  const activeChannel = CHANNELS_LIST.find((c) => c.id === activeChannelId) || CHANNELS_LIST[0];

  const renderUpcomingDetails = (channel: ChannelItem) => {
    const featureOutlook: Record<string, Array<{ title: string; desc: string }>> = {
      telegram: [
        { title: '全球代理支持', desc: '支持配置 Socks5、HTTP 代理，确保在各种服务器网络环境中皆可完美连通服务。' },
        { title: '流式实时输出', desc: '适配 Telegram 文本消息机制，支持把回答以字符流方式增量输出，减少交互迟滞感。' },
        { title: '多模态消息收发', desc: '支持接收与发送图片、音频、文档、地理位置等多种消息类型，极大拓宽交互边界。' }
      ],
      slack: [
        { title: 'Block Kit 交互组件', desc: '全面适配 Slack App Block Kit，支持丰富的原生按钮、表单、下拉框等组件交互。' },
        { title: '线程楼中楼 (Threads)', desc: '支持跟踪 Slack 里的多条回复线程，提供独立且精准的多会话上下文关联。' },
        { title: 'Slash 快捷指令', desc: '允许注册专属快捷命令（如 `/clean`），直接调用智能体底层预设技能。' }
      ],
      wechat: [
        { title: '企业通讯录关联', desc: '通过企业微信 API，自动识别并绑定内部实名用户，进行细粒度的权限分配。' },
        { title: '外部联系人/群响应', desc: '支持与外部联系人、外部群进行智能交互，实现全天候的自动客户服务。' },
        { title: '应用专属快捷菜单', desc: '可配置企业微信底部的快捷按键与自定义菜单，方便用户一键呼出核心功能。' }
      ],
      dingtalk: [
        { title: '互动卡片 (Dynamic Card)', desc: '深度对接钉钉专属互动卡片，支持卡片内状态动态变更与按钮局部刷新。' },
        { title: '单聊与群聊机器人', desc: '支持以独立聊天助手或群聊机器人的双重形态入驻钉钉，按需响应艾特消息。' },
        { title: '工作通知推送', desc: '可在后台主动向特定员工推送任务流状态更新、告警提醒等异步通知。' }
      ],
      webhook: [
        { title: '自定义通信协议', desc: '提供开放的规范，可通过自定义 Headers、验签字段，打通任意自主开发聊天工具。' },
        { title: '双向异步推送', desc: '支持同步等待返回，也支持通过持久连接或异步回调的形式把最终回答推送给第三方。' },
        { title: '多智能体路由配置', desc: '可根据传入 Webhook 请求的参数，将消息灵活路由至不同的智能体或技能组中。' }
      ]
    };

    const currentFeatures = featureOutlook[channel.id] || [];

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
                {votes[channel.id]}
              </div>
              <span className="text-[10px] text-[hsl(var(--muted))] font-medium uppercase tracking-wider block mt-0.5">
                次用户投票支持
              </span>
            </div>
            <Button
              onClick={() => handleVote(channel.id)}
              disabled={hasVoted[channel.id]}
              variant={hasVoted[channel.id] ? 'secondary' : 'default'}
              className={`h-9 px-5 font-semibold text-xs transition-all duration-200 cursor-pointer flex items-center gap-2 ${hasVoted[channel.id]
                  ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.2)]'
                  : 'bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))]'
                }`}
            >
              {hasVoted[channel.id] ? (
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
            {currentFeatures.map((feat, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] flex flex-col gap-1 hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-200">
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
  };

  const getFeishuBadge = () => {
    const isFeishuEnabled = props.status?.feishuChannel?.enabled;
    const isFeishuConfigured = props.status?.feishuChannel?.configured;
    if (isFeishuEnabled) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.15)]">
          已启用
        </span>
      );
    } else if (isFeishuConfigured) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.15)]">
          已配置
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.15)]">
          未启用
        </span>
      );
    }
  };

  const filterTabs = [
    { id: 'all', label: '全部' },
    { id: 'configured', label: '已启用/已配置' },
    { id: 'upcoming', label: '规划中' }
  ] as const;

  return (
    <div className="w-full h-full flex flex-col gap-6 animate-fade-in py-2 flex-1 min-h-0">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--hairline-soft))] pb-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-2xl text-[hsl(var(--ink))] font-normal tracking-tight">
            聊天通道与客户端 (Channels)
          </h2>
          <span className="text-xs text-[hsl(var(--muted))]">
            配置并接入聊天应用，将智能体分发部署到社交或企业协同办公平台。
          </span>
        </div>
      </div>

      {/* Controls filter bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-soft))] w-3.5 h-3.5" />
          <Input
            placeholder="搜索通道名称或描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs rounded-lg placeholder:text-xs"
          />
        </div>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-soft))/0.6] p-0.5 rounded-lg border border-[hsl(var(--hairline-soft))] overflow-x-auto max-w-full">
          {filterTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[11px] rounded-md font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${active
                    ? 'bg-[hsl(var(--primary))] text-white shadow-xs font-semibold'
                    : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--ink))] hover:bg-[hsl(var(--surface-cream-strong))/0.4]'
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Channel Cards Grid */}
      <ScrollArea className="flex-1 -mr-2 pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
          {filteredChannels.length > 0 ? (
            filteredChannels.map((channel) => {
              const isFeishu = channel.id === 'feishu';
              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    setActiveChannelId(channel.id);
                    setIsDrawerOpen(true);
                  }}
                  className="group rounded-xl border border-[hsl(var(--hairline))] bg-gradient-to-br from-[hsl(var(--surface-card))] to-[hsl(var(--surface-soft))/0.3] p-5 flex flex-col justify-between gap-4 transition-all duration-300 hover:border-[hsl(var(--primary)/0.25)] hover:shadow-md cursor-pointer relative overflow-hidden"
                >
                  {/* Top Bar: Icon & Status */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="shrink-0 transition-transform group-hover:scale-105">
                      {getChannelIcon(channel.iconName, 'w-6 h-6')}
                    </div>
                    {isFeishu ? (
                      getFeishuBadge()
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--muted)/0.06)] text-[hsl(var(--muted))] border-[hsl(var(--hairline))]">
                        规划中
                      </span>
                    )}
                  </div>

                  {/* Info Section */}
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

                  {/* Actions / Info Row */}
                  <div className="flex items-center justify-between border-t border-[hsl(var(--hairline-soft))]/50 pt-3 mt-auto">
                    {isFeishu ? (
                      <span className="text-[10px] text-[hsl(var(--primary))] font-semibold flex items-center gap-0.5">
                        <Settings className="w-3.5 h-3.5" />
                        配置通道
                      </span>
                    ) : (
                      <span className="text-[10px] text-[hsl(var(--muted-soft))] font-medium flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3 text-[hsl(var(--primary))]" />
                        支持投票 ({votes[channel.id]} 票)
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-soft))] group-hover:text-[hsl(var(--primary))] transition-colors group-hover:translate-x-0.5 duration-200" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 flex flex-col items-center justify-center gap-3 border border-dashed border-[hsl(var(--hairline-soft))] rounded-2xl bg-[hsl(var(--surface-soft))/0.1]">
              <Search className="w-10 h-10 text-[hsl(var(--muted-soft))] border border-dashed border-[hsl(var(--hairline))] p-2 rounded-full" />
              <span className="text-xs text-[hsl(var(--muted))]">没有匹配的通道，尝试其他搜索词</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Slide-over Right Drawer (Sheet) */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl bg-[hsl(var(--canvas))] border-l border-[hsl(var(--hairline))] p-6 h-full flex flex-col">
          <SheetHeader className="flex-shrink-0 pb-4 border-b border-[hsl(var(--hairline))] mb-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                {getChannelIcon(activeChannel.iconName, 'w-8 h-8')}
              </div>
              <div>
                <SheetTitle className="font-serif text-lg text-[hsl(var(--ink))]">
                  {activeChannel.name} 通道设置
                </SheetTitle>
                <SheetDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                  {activeChannel.isUpcoming ? '查看规划功能并为它投票排期' : '配置飞书自建应用的 App ID, Key 凭证以及连接方式'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 pr-4 -mr-4 overflow-y-auto">
            {activeChannelId === 'feishu' ? (
              <FeishuPluginPanel {...props} />
            ) : (
              renderUpcomingDetails(activeChannel)
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
