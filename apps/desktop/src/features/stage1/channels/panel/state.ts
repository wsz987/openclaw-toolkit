import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { PluginUninstallDialogState } from '../../channels/shared/components/plugin-uninstall-dialog';
import { useFeishuChannelControl } from '../../channels/feishu/hooks/use-feishu-channel-control';
import type { FeishuPluginPanelProps } from '../../channels/feishu/components/feishu-plugin-panel';
import { findInstalledFeishuPlugin } from '../../channels/feishu/model/feishu-channel';
import { useWechatChannelControl } from '../../channels/wechat/hooks/use-wechat-channel-control';
import { findInstalledWechatPlugin } from '../../channels/wechat/model/wechat-channel';
import { useDingtalkChannelControl } from '../../channels/dingtalk/hooks/use-dingtalk-channel-control';
import { findInstalledDingtalkPlugin } from '../../channels/dingtalk/model/dingtalk-channel';
import type { OpenClawDingtalkChannelSetupPayload, OpenClawDingtalkChannelSetupResult } from '../../model/types';
import type { ChannelController } from '../../channels/shared/model/channel-controller';
import type { UsePluginOperationResult } from '../../channels/shared/hooks/use-plugin-install';
import {
  CHANNELS_LIST,
  type ChannelActionState,
  type ChannelId,
  type ChannelItem
} from './model';

export const CHANNELS_FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'configured', label: '已启用/已配置' },
  { id: 'upcoming', label: '规划中' }
] as const;

export type ChannelsTabId = (typeof CHANNELS_FILTER_TABS)[number]['id'];

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

const MANAGED_CHANNEL_IDS = ['feishu', 'wechat', 'dingtalk'] as const;
type ManagedChannelId = (typeof MANAGED_CHANNEL_IDS)[number];

function isManagedChannelId(channelId: ChannelId | null): channelId is ManagedChannelId {
  return Boolean(channelId && MANAGED_CHANNEL_IDS.includes(channelId as ManagedChannelId));
}

export type ChannelsPanelStateProps = FeishuPluginPanelProps & {
  dingtalkSetupLoading: boolean;
  dingtalkSetupResult: OpenClawDingtalkChannelSetupResult | null;
  onDingtalkChannelSetup: (
    input: OpenClawDingtalkChannelSetupPayload
  ) => Promise<OpenClawDingtalkChannelSetupResult | null>;
};

export function useChannelsPanelState(props: ChannelsPanelStateProps) {
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
  const dingtalkControl = useDingtalkChannelControl({
    result: props.result,
    status: props.status,
    statusLoading: props.statusLoading,
    dingtalkSetupLoading: props.dingtalkSetupLoading,
    dingtalkSetupResult: props.dingtalkSetupResult,
    pluginInstallResult: props.pluginInstallResult,
    onDingtalkChannelSetup: props.onDingtalkChannelSetup
  });

  const channelControllers = useMemo<Partial<Record<ChannelId, ChannelController>>>(
    () => ({
      feishu: feishuControl.controller,
      wechat: wechatControl.controller,
      dingtalk: dingtalkControl.controller
    }),
    [feishuControl.controller, wechatControl.controller, dingtalkControl.controller]
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
      },
      dingtalk: {
        pluginInstalled: Boolean(findInstalledDingtalkPlugin(props.status?.installedPlugins)),
        pluginInstalling: dingtalkControl.pluginInstall.installing,
        pluginUninstalling: dingtalkControl.pluginUninstall.installing,
        onPluginUninstall: async () => {
          await dingtalkControl.handlePluginUninstall('钉钉 (DingTalk)');
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
      wechatControl.pluginUninstall.installing,
      dingtalkControl.handlePluginUninstall,
      dingtalkControl.pluginInstall.installing,
      dingtalkControl.pluginUninstall.installing
    ]
  );

  const channelPluginInstallStates = useMemo<Partial<Record<ChannelId, UsePluginOperationResult>>>(
    () => ({
      feishu: feishuControl.pluginInstall,
      wechat: wechatControl.pluginInstall,
      dingtalk: dingtalkControl.pluginInstall
    }),
    [feishuControl.pluginInstall, wechatControl.pluginInstall, dingtalkControl.pluginInstall]
  );

  const activePluginInstallState = useMemo(
    () => resolveActivePluginInstallState(channelPluginInstallStates),
    [channelPluginInstallStates]
  );

  const managedChannelControls = useMemo(
    () => ({
      feishu: {
        pluginName: '飞书 / Lark',
        control: feishuControl
      },
      wechat: {
        pluginName: '微信 ClawBot',
        control: wechatControl
      },
      dingtalk: {
        pluginName: '钉钉 (DingTalk)',
        control: dingtalkControl
      }
    }) satisfies Record<
      ManagedChannelId,
      {
        pluginName: string;
        control: {
          forceEnabled: boolean;
          markForceEnabledHandled: () => void;
          handleControllerToggle: (channelName: string, nextEnabled: boolean) => Promise<void>;
          handlePluginUninstall: (channelName: string) => Promise<boolean>;
          pluginInstall: UsePluginOperationResult;
          pluginUninstall: UsePluginOperationResult;
        };
      }
    >,
    [dingtalkControl, feishuControl, wechatControl]
  );

  const activeManagedUninstallContext = isManagedChannelId(uninstallDialogChannelId)
    ? managedChannelControls[uninstallDialogChannelId]
    : null;

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
    if (!dingtalkControl.forceEnabled) {
      return;
    }

    setActiveChannelId('dingtalk');
    setIsDrawerOpen(true);
  }, [dingtalkControl.forceEnabled]);

  useEffect(() => {
    const anyPluginUninstalling = Object.values(managedChannelControls).some(
      ({ control }) => control.pluginUninstall.installing
    );

    if (anyPluginUninstalling) {
      setUninstallDialogState('loading');
      return;
    }

    if (!activeManagedUninstallContext) {
      return;
    }

    const activeUninstallState = activeManagedUninstallContext.control.pluginUninstall;

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
    activeManagedUninstallContext,
    managedChannelControls,
    uninstallDialogState,
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

  const activeUninstallState = activeManagedUninstallContext?.control.pluginUninstall ?? feishuControl.pluginUninstall;

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

    if (!isManagedChannelId(channel.id)) {
      return;
    }

    await managedChannelControls[channel.id].control.handleControllerToggle(channel.name, nextEnabled);
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
    if (!activeManagedUninstallContext) {
      return;
    }

    setUninstallDialogState('loading');
    const success = await activeManagedUninstallContext.control.handlePluginUninstall(
      activeManagedUninstallContext.pluginName
    );

    if (success) {
      setUninstallDialogState('success');
    }
  }

  function handleUninstallClose() {
    const wasSuccess = uninstallDialogState === 'success';
    setUninstallDialogChannelId(null);
    setUninstallDialogState('confirm');
    Object.values(managedChannelControls).forEach(({ control }) => {
      control.pluginUninstall.close();
    });
    if (wasSuccess) {
      setIsDrawerOpen(false);
    }
  }

  return {
    feishuControl,
    wechatControl,
    dingtalkControl,
    activeChannel,
    activeChannelId,
    activePluginInstallState,
    activeManagedUninstallContext,
    activeTab,
    activeUninstallState,
    channelActionStates,
    channelControllers,
    filteredChannels,
    hasVoted,
    isDrawerOpen,
    searchQuery,
    uninstallDialogChannelId,
    uninstallDialogState,
    votes,
    setActiveTab,
    setIsDrawerOpen,
    setSearchQuery,
    setUninstallDialogChannelId,
    setUninstallDialogState,
    handleChannelCardClick,
    handleControlledChannelToggle,
    handleUninstallClose,
    handleUninstallConfirm,
    handleVote
  };
}
