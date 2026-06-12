import { useEffect, useState } from 'react';
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
  Trash2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { PluginInstallDialog } from '../plugins/shared/components/plugin-install-dialog';
import { PluginUninstallDialog, type PluginUninstallDialogState } from '../plugins/shared/components/plugin-uninstall-dialog';
import { useFeishuChannelControl } from '../plugins/feishu/hooks/use-feishu-channel-control';
import { FeishuPluginPanel, type FeishuPluginPanelProps } from '../plugins/feishu/components/feishu-plugin-panel';
import { findInstalledFeishuPlugin } from '../plugins/feishu/model/feishu-channel';
import type { ChannelController } from '../plugins/shared/model/channel-controller';
import { getChannelIcon } from './channels-panel-icons';

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

type ChannelActionState = {
  pluginInstalled: boolean;
  pluginInstalling: boolean;
  pluginUninstalling: boolean;
  onPluginUninstall?: () => Promise<void>;
};

const CHANNELS_LIST: ChannelItem[] = [
  {
    id: 'feishu',
    name: '飞书 / Lark',
    type: '官方通道',
    iconName: 'feishu',
    description: '支持对接飞书自建应用，包含私聊和群聊。支持 WebSocket 和 Webhook 模式。',
    isUpcoming: false,
    colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-500'
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
    type: '官方通道 (规划中)',
    iconName: 'dingtalk',
    description: '对接钉钉单聊及群聊机器人，支持流式交互卡片 and 快捷菜单。',
    isUpcoming: true,
    colorClass: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    badgeBg: 'bg-orange-500/10 border border-orange-500/20',
    badgeText: 'text-orange-500'
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

function ChannelListSwitch({
  checked,
  disabled,
  loading,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={checked ? '关闭飞书通道' : '启用飞书通道'}
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
        {loading && (
          <Loader2 className="w-3 h-3 animate-spin text-[hsl(var(--primary))]" />
        )}
      </span>
    </button>
  );
}

export function ChannelsPanel(props: ChannelsPanelProps) {
  const [activeChannelId, setActiveChannelId] = useState<string>('feishu');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'configured' | 'upcoming'>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [uninstallDialogChannelId, setUninstallDialogChannelId] = useState<string | null>(null);
  const [uninstallDialogState, setUninstallDialogState] = useState<PluginUninstallDialogState>('confirm');
  const [votes, setVotes] = useState<Record<string, number>>({
    telegram: 42,
    slack: 28,
    wechat: 35,
    dingtalk: 19,
    webhook: 15
  });
  const [hasVoted, setHasVoted] = useState<Record<string, boolean>>({});
  const feishuControl = useFeishuChannelControl(props);
  const feishuController: ChannelController = feishuControl.controller;
  const channelControllers: Partial<Record<ChannelItem['id'], ChannelController>> = {
    feishu: feishuController
  };
  const channelActionStates: Partial<Record<ChannelItem['id'], ChannelActionState>> = {
    feishu: {
      pluginInstalled: Boolean(findInstalledFeishuPlugin(props.status?.installedPlugins)),
      pluginInstalling: feishuControl.pluginInstall.installing,
      pluginUninstalling: feishuControl.pluginUninstall.installing,
      onPluginUninstall: async () => {
        await feishuControl.handlePluginUninstall('飞书 / Lark');
      }
    }
  };

  useEffect(() => {
    if (!feishuControl.forceEditing && !feishuControl.forceEnabled) {
      return;
    }

    setActiveChannelId('feishu');
    setIsDrawerOpen(true);
  }, [feishuControl.forceEditing, feishuControl.forceEnabled]);

  useEffect(() => {
    if (feishuControl.pluginUninstall.installing) {
      setUninstallDialogState('loading');
      return;
    }

    if (uninstallDialogChannelId !== 'feishu') {
      return;
    }

    if (feishuControl.pluginUninstall.error) {
      setUninstallDialogState('error');
      return;
    }

    if (
      uninstallDialogState === 'loading' &&
      !feishuControl.pluginUninstall.installing &&
      !feishuControl.pluginUninstall.error &&
      feishuControl.pluginUninstall.progress !== null
    ) {
      setUninstallDialogState('success');
    }
  }, [
    feishuControl.pluginUninstall.error,
    feishuControl.pluginUninstall.installing,
    uninstallDialogChannelId,
    uninstallDialogState
  ]);

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
    const controller = channelControllers[channel.id];

    // 1. Search filter
    const matchesSearch =
      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Tab filter
    if (activeTab === 'configured') {
      if (controller) {
        return controller.configured || controller.enabled;
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

  const panelRenderers: Partial<Record<ChannelItem['id'], () => React.ReactNode>> = {
    feishu: () => (
      <FeishuPluginPanel
        {...props}
        pluginInstallResult={props.pluginInstallResult}
        onFeishuChannelSetup={async (input) => {
          const response = await props.onFeishuChannelSetup(input);
          if (response) {
            setIsDrawerOpen(false);
          }
          return response;
        }}
        hideInternalEnableToggle
        forceEditing={feishuControl.forceEditing}
        onForceEditingHandled={feishuControl.markForceEditingHandled}
        forceEnabled={feishuControl.forceEnabled}
        onForceEnabledHandled={feishuControl.markForceEnabledHandled}
      />
    )
  };

  const activePanelRenderer = panelRenderers[activeChannelId];

  async function handleControlledChannelToggle(channel: ChannelItem, controller: ChannelController | undefined, nextEnabled: boolean) {
    if (!controller) {
      return;
    }
    await feishuControl.handleControllerToggle(channel.name, nextEnabled);
  }

  async function handleChannelCardClick(channel: ChannelItem, controller: ChannelController | undefined) {
    if (controller?.loading) {
      return;
    }

    setActiveChannelId(channel.id);

    if (!controller) {
      setIsDrawerOpen(true);
      return;
    }

    if (controller.ensureReady) {
      const ready = await controller.ensureReady();
      if (!ready) {
        return;
      }
    }

    setIsDrawerOpen(true);
  }

  const filterTabs = [
    { id: 'all', label: '全部' },
    { id: 'configured', label: '已启用/已配置' },
    { id: 'upcoming', label: '规划中' }
  ] as const;

  return (
    <div className="w-full h-full flex flex-col gap-6 animate-fade-in py-2 flex-1 min-h-0">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-5">
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
              const controller = channelControllers[channel.id];
              const resolvedController = controller ?? null;
              const actionState = channelActionStates[channel.id];
              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    if (resolvedController?.loading) return;
                    void handleChannelCardClick(channel, resolvedController ?? undefined);
                  }}
                  className={`group rounded-xl border border-[hsl(var(--hairline))] bg-gradient-to-br from-[hsl(var(--surface-card))] to-[hsl(var(--surface-soft))/0.3] p-5 flex flex-col justify-between gap-4 transition-all duration-300 relative overflow-hidden ${
                    resolvedController?.loading
                      ? 'animate-pulse opacity-80 border-[hsl(var(--primary)/0.25)]'
                      : 'hover:border-[hsl(var(--primary)/0.25)] hover:shadow-md cursor-pointer'
                  }`}
                >
                  {/* Top Bar: Icon & Status */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="shrink-0 transition-transform group-hover:scale-105">
                      {getChannelIcon(channel.iconName, 'w-6 h-6')}
                    </div>
                    <div className="flex items-center gap-2">
                      {resolvedController ? (
                        <ChannelListSwitch
                          checked={Boolean(resolvedController.enabled)}
                          disabled={resolvedController.loading}
                          loading={resolvedController.loading}
                          onChange={(checked) => {
                            void handleControlledChannelToggle(channel, resolvedController, checked);
                          }}
                        />
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border leading-none tracking-wide bg-[hsl(var(--muted)/0.06)] text-[hsl(var(--muted))] border-[hsl(var(--hairline))]">
                          规划中
                        </span>
                      )}
                    </div>
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
                        支持投票 ({votes[channel.id]} 票)
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
                            setUninstallDialogChannelId(channel.id);
                            setUninstallDialogState('confirm');
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
          <SheetHeader className="flex-shrink-0 pb-4 border-b border-[hsl(var(--hairline))]">
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

          {activePanelRenderer ? (
            activePanelRenderer()
          ) : (
            <ScrollArea className="flex-1 pr-4 -mr-4">
              {renderUpcomingDetails(activeChannel)}
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <PluginInstallDialog
        open={feishuControl.pluginInstall.open}
        installing={feishuControl.pluginInstall.installing}
        progress={feishuControl.pluginInstall.progress}
        error={feishuControl.pluginInstall.error}
        title={feishuControl.pluginInstall.dialog.title}
        description={feishuControl.pluginInstall.dialog.description}
        idleMessage={feishuControl.pluginInstall.dialog.idleMessage}
        installingLabel={feishuControl.pluginInstall.dialog.installingLabel}
        errorLabel={feishuControl.pluginInstall.dialog.errorLabel}
        cancelLabel={feishuControl.pluginInstall.dialog.cancelLabel}
        closeLabel={feishuControl.pluginInstall.dialog.closeLabel}
        onCancel={feishuControl.pluginInstall.close}
      />

      <PluginUninstallDialog
        open={uninstallDialogChannelId === 'feishu'}
        state={uninstallDialogState}
        progress={feishuControl.pluginUninstall.progress}
        error={feishuControl.pluginUninstall.error}
        pluginName="飞书 / Lark"
        onConfirm={async () => {
          setUninstallDialogState('loading');
          const success = await feishuControl.handlePluginUninstall('飞书 / Lark');
          if (success) {
            setUninstallDialogState('success');
          }
        }}
        onClose={() => {
          const wasSuccess = uninstallDialogState === 'success';
          setUninstallDialogChannelId(null);
          setUninstallDialogState('confirm');
          feishuControl.pluginUninstall.close();
          if (wasSuccess) {
            setIsDrawerOpen(false);
          }
        }}
      />
    </div>
  );
}
