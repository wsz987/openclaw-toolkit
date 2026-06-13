import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { PluginInstallDialog } from '../plugins/shared/components/plugin-install-dialog';
import { PluginUninstallDialog, type PluginUninstallDialogState } from '../plugins/shared/components/plugin-uninstall-dialog';
import { useFeishuChannelControl } from '../plugins/feishu/hooks/use-feishu-channel-control';
import { FeishuPluginPanel, type FeishuPluginPanelProps } from '../plugins/feishu/components/feishu-plugin-panel';
import { findInstalledFeishuPlugin } from '../plugins/feishu/model/feishu-channel';
import { useWechatChannelControl } from '../plugins/wechat/hooks/use-wechat-channel-control';
import { WechatPluginPanel } from '../plugins/wechat/components/wechat-plugin-panel';
import { findInstalledWechatPlugin } from '../plugins/wechat/model/wechat-channel';
import type { ChannelController } from '../plugins/shared/model/channel-controller';
import type { UsePluginOperationResult } from '../plugins/shared/hooks/use-plugin-install';
import { getChannelIcon } from './channels-panel-icons';
import { ChannelsPanelCard } from './channels-panel-card';
import {
  CHANNELS_LIST,
  type ChannelActionState,
  type ChannelId,
  type ChannelItem
} from './channels-panel-model';
import { ChannelsUpcomingDetails } from './channels-panel-upcoming';

export type ChannelsPanelProps = FeishuPluginPanelProps;

const FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'configured', label: '已启用/已配置' },
  { id: 'upcoming', label: '规划中' }
] as const;

type ChannelsTabId = (typeof FILTER_TABS)[number]['id'];

function getChannelName(channelId: string) {
  return CHANNELS_LIST.find((channel) => channel.id === channelId)?.name || '';
}

function resolveActivePluginInstallState(
  channelPluginInstallStates: Partial<Record<ChannelId, UsePluginOperationResult>>
) {
  const activeChannelId =
    (Object.entries(channelPluginInstallStates).find(([, state]) => state?.open)?.[0] as
      | ChannelId
      | undefined) ?? undefined;

  return activeChannelId ? channelPluginInstallStates[activeChannelId] : undefined;
}

export function ChannelsPanel(props: ChannelsPanelProps) {
  const [activeChannelId, setActiveChannelId] = useState<ChannelId>('feishu');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ChannelsTabId>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [uninstallDialogChannelId, setUninstallDialogChannelId] = useState<ChannelId | null>(null);
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
  const wechatControl = useWechatChannelControl({
    result: props.result,
    status: props.status,
    statusLoading: props.statusLoading,
    pluginInstallResult: props.pluginInstallResult
  });

  const channelControllers = useMemo<Partial<Record<ChannelId, ChannelController>>>(
    () => ({
      feishu: feishuControl.controller,
      wechat: wechatControl.controller
    }),
    [feishuControl.controller, wechatControl.controller]
  );

  const channelActionStates = useMemo<Partial<Record<ChannelId, ChannelActionState>>>(
    () => ({
      feishu: {
        pluginInstalled: Boolean(findInstalledFeishuPlugin(props.status?.installedPlugins)),
        pluginInstalling: feishuControl.pluginInstall.installing,
        pluginUninstalling: feishuControl.pluginUninstall.installing,
        onPluginUninstall: async () => {
          await feishuControl.handlePluginUninstall('飞书 / Lark');
        }
      },
      wechat: {
        pluginInstalled: Boolean(findInstalledWechatPlugin(props.status?.installedPlugins)),
        pluginInstalling: wechatControl.pluginInstall.installing,
        pluginUninstalling: wechatControl.pluginUninstall.installing,
        onPluginUninstall: async () => {
          await wechatControl.handlePluginUninstall('微信 ClawBot');
        }
      }
    }),
    [
      feishuControl.handlePluginUninstall,
      feishuControl.pluginInstall.installing,
      feishuControl.pluginUninstall.installing,
      props.status?.installedPlugins,
      wechatControl.handlePluginUninstall,
      wechatControl.pluginInstall.installing,
      wechatControl.pluginUninstall.installing
    ]
  );

  const channelPluginInstallStates = useMemo<Partial<Record<ChannelId, UsePluginOperationResult>>>(
    () => ({
      feishu: feishuControl.pluginInstall,
      wechat: wechatControl.pluginInstall
    }),
    [feishuControl.pluginInstall, wechatControl.pluginInstall]
  );

  const activePluginInstallState = useMemo(
    () => resolveActivePluginInstallState(channelPluginInstallStates),
    [channelPluginInstallStates]
  );

  useEffect(() => {
    if (!feishuControl.forceEnabled) {
      return;
    }

    setActiveChannelId('feishu');
    setIsDrawerOpen(true);
  }, [feishuControl.forceEnabled]);

  useEffect(() => {
    if (!wechatControl.forceEnabled) {
      return;
    }

    setActiveChannelId('wechat');
    setIsDrawerOpen(true);
  }, [wechatControl.forceEnabled]);

  useEffect(() => {
    if (feishuControl.pluginUninstall.installing || wechatControl.pluginUninstall.installing) {
      setUninstallDialogState('loading');
      return;
    }

    if (uninstallDialogChannelId !== 'feishu' && uninstallDialogChannelId !== 'wechat') {
      return;
    }

    const activeUninstallState =
      uninstallDialogChannelId === 'wechat'
        ? wechatControl.pluginUninstall
        : feishuControl.pluginUninstall;

    if (activeUninstallState.error) {
      setUninstallDialogState('error');
      return;
    }

    if (
      uninstallDialogState === 'loading' &&
      !activeUninstallState.installing &&
      !activeUninstallState.error &&
      activeUninstallState.progress !== null
    ) {
      setUninstallDialogState('success');
    }
  }, [
    feishuControl.pluginUninstall,
    uninstallDialogChannelId,
    uninstallDialogState,
    wechatControl.pluginUninstall
  ]);

  const activeChannel = CHANNELS_LIST.find((channel) => channel.id === activeChannelId) || CHANNELS_LIST[0];

  const filteredChannels = useMemo(
    () =>
      CHANNELS_LIST.filter((channel) => {
        const controller = channelControllers[channel.id];
        const matchesSearch =
          channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          channel.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          channel.description.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) {
          return false;
        }

        if (activeTab === 'configured') {
          return controller ? controller.configured || controller.enabled : false;
        }

        if (activeTab === 'upcoming') {
          return channel.isUpcoming;
        }

        return true;
      }),
    [activeTab, channelControllers, searchQuery]
  );

  const panelRenderers = useMemo<Partial<Record<ChannelId, () => React.ReactNode>>>(
    () => ({
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
          forceEnabled={feishuControl.forceEnabled}
          onForceEnabledHandled={feishuControl.markForceEnabledHandled}
        />
      ),
      wechat: () => (
        <WechatPluginPanel
          result={props.result}
          status={props.status}
          statusLoading={props.statusLoading}
          pluginInstallResult={props.pluginInstallResult}
          loginBusy={wechatControl.controller.loading}
          forceEnabled={wechatControl.forceEnabled}
          onForceEnabledHandled={wechatControl.markForceEnabledHandled}
        />
      )
    }),
    [feishuControl.forceEnabled, feishuControl.markForceEnabledHandled, props, wechatControl.controller.loading, wechatControl.forceEnabled, wechatControl.markForceEnabledHandled]
  );

  const activePanelRenderer = panelRenderers[activeChannelId];

  function handleVote(channelId: string) {
    if (hasVoted[channelId]) {
      toast.warning('您已经为该通道投过票了！');
      return;
    }

    setVotes((current) => ({
      ...current,
      [channelId]: current[channelId] + 1
    }));
    setHasVoted((current) => ({
      ...current,
      [channelId]: true
    }));
    toast.success(`投票成功！感谢您支持优先开发 ${getChannelName(channelId)} 通道。`);
  }

  async function handleControlledChannelToggle(
    channel: ChannelItem,
    controller: ChannelController | undefined,
    nextEnabled: boolean
  ) {
    if (!controller) {
      return;
    }

    if (channel.id === 'wechat') {
      await wechatControl.handleControllerToggle(channel.name, nextEnabled);
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

  async function handleUninstallConfirm() {
    setUninstallDialogState('loading');
    const success =
      uninstallDialogChannelId === 'wechat'
        ? await wechatControl.handlePluginUninstall('微信 ClawBot')
        : await feishuControl.handlePluginUninstall('飞书 / Lark');

    if (success) {
      setUninstallDialogState('success');
    }
  }

  function handleUninstallClose() {
    const wasSuccess = uninstallDialogState === 'success';
    setUninstallDialogChannelId(null);
    setUninstallDialogState('confirm');
    feishuControl.pluginUninstall.close();
    wechatControl.pluginUninstall.close();
    if (wasSuccess) {
      setIsDrawerOpen(false);
    }
  }

  const activeUninstallState =
    uninstallDialogChannelId === 'wechat'
      ? wechatControl.pluginUninstall
      : feishuControl.pluginUninstall;

  return (
    <div className="w-full h-full flex flex-col gap-6 animate-fade-in py-2 flex-1 min-h-0">
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

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-soft))] w-3.5 h-3.5" />
          <Input
            placeholder="搜索通道名称或描述..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9 h-9 text-xs rounded-lg placeholder:text-xs"
          />
        </div>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-soft))/0.6] p-0.5 rounded-lg border border-[hsl(var(--hairline-soft))] overflow-x-auto max-w-full">
          {FILTER_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-[11px] rounded-md font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  active
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

      <ScrollArea className="flex-1 -mr-2 pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
          {filteredChannels.length > 0 ? (
            filteredChannels.map((channel) => (
              <ChannelsPanelCard
                key={channel.id}
                channel={channel}
                controller={channelControllers[channel.id]}
                actionState={channelActionStates[channel.id]}
                voteCount={votes[channel.id] ?? 0}
                onCardClick={() =>
                  void handleChannelCardClick(channel, channelControllers[channel.id] ?? undefined)
                }
                onToggle={(checked) =>
                  void handleControlledChannelToggle(
                    channel,
                    channelControllers[channel.id] ?? undefined,
                    checked
                  )
                }
                onRequestUninstall={() => {
                  setUninstallDialogChannelId(channel.id);
                  setUninstallDialogState('confirm');
                }}
              />
            ))
          ) : (
            <div className="col-span-full py-16 flex flex-col items-center justify-center gap-3 border border-dashed border-[hsl(var(--hairline-soft))] rounded-2xl bg-[hsl(var(--surface-soft))/0.1]">
              <Search className="w-10 h-10 text-[hsl(var(--muted-soft))] border border-dashed border-[hsl(var(--hairline))] p-2 rounded-full" />
              <span className="text-xs text-[hsl(var(--muted))]">没有匹配的通道，尝试其他搜索词</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl bg-[hsl(var(--canvas))] border-l border-[hsl(var(--hairline))] p-6 h-full flex flex-col">
          <SheetHeader className="flex-shrink-0 pb-4 border-b border-[hsl(var(--hairline))]">
            <div className="flex items-center gap-3">
              <div className="shrink-0">{getChannelIcon(activeChannel.iconName, 'w-8 h-8')}</div>
              <div>
                <SheetTitle className="font-serif text-lg text-[hsl(var(--ink))]">
                  {activeChannel.name} 通道设置
                </SheetTitle>
                <SheetDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                  {activeChannel.drawerDescription}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {activePanelRenderer ? (
            activePanelRenderer()
          ) : (
            <ScrollArea className="flex-1 pr-4 -mr-4">
              <ChannelsUpcomingDetails
                channel={activeChannel}
                voteCount={votes[activeChannel.id] ?? 0}
                hasVoted={Boolean(hasVoted[activeChannel.id])}
                onVote={handleVote}
              />
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <PluginInstallDialog
        open={Boolean(activePluginInstallState?.open)}
        installing={Boolean(activePluginInstallState?.installing)}
        progress={activePluginInstallState?.progress ?? null}
        error={activePluginInstallState?.error ?? null}
        title={activePluginInstallState?.dialog.title ?? ''}
        description={activePluginInstallState?.dialog.description ?? ''}
        idleMessage={activePluginInstallState?.dialog.idleMessage ?? ''}
        installingLabel={activePluginInstallState?.dialog.installingLabel ?? ''}
        errorLabel={activePluginInstallState?.dialog.errorLabel ?? ''}
        cancelLabel={activePluginInstallState?.dialog.cancelLabel}
        closeLabel={activePluginInstallState?.dialog.closeLabel}
        onCancel={() => activePluginInstallState?.close()}
      />

      <PluginUninstallDialog
        open={uninstallDialogChannelId === 'feishu' || uninstallDialogChannelId === 'wechat'}
        state={uninstallDialogState}
        progress={activeUninstallState.progress}
        error={activeUninstallState.error}
        pluginName={uninstallDialogChannelId === 'wechat' ? '微信 ClawBot' : '飞书 / Lark'}
        onConfirm={() => void handleUninstallConfirm()}
        onClose={handleUninstallClose}
      />
    </div>
  );
}
