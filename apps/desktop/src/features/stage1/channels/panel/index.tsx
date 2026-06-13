import { Search } from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../../components/ui/sheet';
import { PluginInstallDialog } from '../../channels/shared/components/plugin-install-dialog';
import { PluginUninstallDialog } from '../../channels/shared/components/plugin-uninstall-dialog';
import { FeishuPluginPanel, type FeishuPluginPanelProps } from '../../channels/feishu/components/feishu-plugin-panel';
import { WechatPluginPanel } from '../../channels/wechat/components/wechat-plugin-panel';
import { ChannelsPanelCard } from './card';
import { getChannelIcon } from './icons';
import { CHANNELS_FILTER_TABS, useChannelsPanelState } from './state';
import { ChannelsUpcomingDetails } from './upcoming';

export type ChannelsPanelProps = FeishuPluginPanelProps;

export function ChannelsPanel(props: ChannelsPanelProps) {
  const state = useChannelsPanelState(props);

  const panelRenderers = {
    feishu: () => (
      <FeishuPluginPanel
        {...props}
        pluginInstallResult={props.pluginInstallResult}
        onFeishuChannelSetup={async (input) => {
          const response = await props.onFeishuChannelSetup(input);
          if (response) {
            state.setIsDrawerOpen(false);
          }
          return response;
        }}
        hideInternalEnableToggle
        forceEnabled={state.feishuControl.forceEnabled}
        onForceEnabledHandled={state.feishuControl.markForceEnabledHandled}
      />
    ),
    wechat: () => (
      <WechatPluginPanel
        result={props.result}
        status={props.status}
        statusLoading={props.statusLoading}
        pluginInstallResult={props.pluginInstallResult}
        loginBusy={state.wechatControl.controller.loading}
        forceEnabled={state.wechatControl.forceEnabled}
        onForceEnabledHandled={state.wechatControl.markForceEnabledHandled}
      />
    )
  } as const;

  const activePanelRenderer = panelRenderers[state.activeChannelId as keyof typeof panelRenderers];

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
            value={state.searchQuery}
            onChange={(event) => state.setSearchQuery(event.target.value)}
            className="pl-9 h-9 text-xs rounded-lg placeholder:text-xs"
          />
        </div>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-soft))/0.6] p-0.5 rounded-lg border border-[hsl(var(--hairline-soft))] overflow-x-auto max-w-full">
          {CHANNELS_FILTER_TABS.map((tab) => {
            const active = state.activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => state.setActiveTab(tab.id)}
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
          {state.filteredChannels.length > 0 ? (
            state.filteredChannels.map((channel) => (
              <ChannelsPanelCard
                key={channel.id}
                channel={channel}
                controller={state.channelControllers[channel.id]}
                actionState={state.channelActionStates[channel.id]}
                voteCount={state.votes[channel.id] ?? 0}
                onCardClick={() =>
                  void state.handleChannelCardClick(channel, state.channelControllers[channel.id] ?? undefined)
                }
                onToggle={(checked) =>
                  void state.handleControlledChannelToggle(
                    channel,
                    state.channelControllers[channel.id] ?? undefined,
                    checked
                  )
                }
                onRequestUninstall={() => {
                  state.setUninstallDialogChannelId(channel.id);
                  state.setUninstallDialogState('confirm');
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

      <Sheet open={state.isDrawerOpen} onOpenChange={state.setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl bg-[hsl(var(--canvas))] border-l border-[hsl(var(--hairline))] p-6 h-full flex flex-col">
          <SheetHeader className="flex-shrink-0 pb-4 border-b border-[hsl(var(--hairline))]">
            <div className="flex items-center gap-3">
              <div className="shrink-0">{getChannelIcon(state.activeChannel.iconName, 'w-8 h-8')}</div>
              <div>
                <SheetTitle className="font-serif text-lg text-[hsl(var(--ink))]">
                  {state.activeChannel.name} 通道设置
                </SheetTitle>
                <SheetDescription className="text-xs text-[hsl(var(--muted))] mt-0.5">
                  {state.activeChannel.drawerDescription}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {activePanelRenderer ? (
            activePanelRenderer()
          ) : (
            <ScrollArea className="flex-1 pr-4 -mr-4">
              <ChannelsUpcomingDetails
                channel={state.activeChannel}
                voteCount={state.votes[state.activeChannel.id] ?? 0}
                hasVoted={Boolean(state.hasVoted[state.activeChannel.id])}
                onVote={state.handleVote}
              />
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <PluginInstallDialog
        open={Boolean(state.activePluginInstallState?.open)}
        installing={Boolean(state.activePluginInstallState?.installing)}
        progress={state.activePluginInstallState?.progress ?? null}
        error={state.activePluginInstallState?.error ?? null}
        title={state.activePluginInstallState?.dialog.title ?? ''}
        description={state.activePluginInstallState?.dialog.description ?? ''}
        idleMessage={state.activePluginInstallState?.dialog.idleMessage ?? ''}
        installingLabel={state.activePluginInstallState?.dialog.installingLabel ?? ''}
        errorLabel={state.activePluginInstallState?.dialog.errorLabel ?? ''}
        cancelLabel={state.activePluginInstallState?.dialog.cancelLabel}
        closeLabel={state.activePluginInstallState?.dialog.closeLabel}
        onCancel={() => state.activePluginInstallState?.close()}
      />

      <PluginUninstallDialog
        open={state.uninstallDialogChannelId === 'feishu' || state.uninstallDialogChannelId === 'wechat'}
        state={state.uninstallDialogState}
        progress={state.activeUninstallState.progress}
        error={state.activeUninstallState.error}
        pluginName={state.uninstallDialogChannelId === 'wechat' ? '微信 ClawBot' : '飞书 / Lark'}
        onConfirm={() => void state.handleUninstallConfirm()}
        onClose={state.handleUninstallClose}
      />
    </div>
  );
}
