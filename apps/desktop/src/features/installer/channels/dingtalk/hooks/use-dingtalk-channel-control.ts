import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { DingtalkPluginPanelProps } from '../components/dingtalk-plugin-panel';
import { createDingtalkChannelController } from '../model/dingtalk-channel-controller';
import { useDingtalkPluginInstall } from './use-dingtalk-plugin-install';
import { useDingtalkPluginUninstall } from './use-dingtalk-plugin-uninstall';
import { useChannelActivation } from '../../shared/hooks/use-channel-activation';

type UseDingtalkChannelControlResult = {
  controller: ReturnType<typeof createDingtalkChannelController>;
  forceEnabled: boolean;
  pluginInstall: ReturnType<typeof useDingtalkPluginInstall>;
  pluginUninstall: ReturnType<typeof useDingtalkPluginUninstall>;
  openConfiguration: (forceEnabled?: boolean) => void;
  handleControllerToggle: (channelName: string, nextEnabled: boolean) => Promise<void>;
  handlePluginUninstall: (channelName: string) => Promise<boolean>;
  markForceEnabledHandled: () => void;
};

export function useDingtalkChannelControl(props: DingtalkPluginPanelProps): UseDingtalkChannelControlResult {
  const [forceEnabled, setForceEnabled] = useState(false);
  const pluginInstall = useDingtalkPluginInstall(props.result.configPath);
  const pluginUninstall = useDingtalkPluginUninstall(props.result.configPath);

  const openConfiguration = useCallback((nextForceEnabled = false) => {
    if (nextForceEnabled) {
      setForceEnabled(true);
    }
  }, []);

  const controller = createDingtalkChannelController({
    result: props.result,
    status: props.status,
    loading:
      props.statusLoading ||
      props.dingtalkSetupLoading ||
      pluginInstall.installing ||
      pluginUninstall.installing ||
      pluginInstall.checking ||
      pluginUninstall.checking,
    ensureReady: pluginInstall.ensureReady,
    onDingtalkChannelSetup: props.onDingtalkChannelSetup,
    openConfiguration: () => openConfiguration(true)
  });

  const activation = useChannelActivation({
    enabled: controller.enabled,
    configured: controller.configured,
    loading: controller.loading,
    ensureReady: controller.ensureReady,
    onEnable: controller.enable,
    onDisable: controller.disable,
    onRequireConfiguration: controller.openConfiguration
  });

  const handleControllerToggle = useCallback(
    async (channelName: string, nextEnabled: boolean) => {
      const changed = await activation.toggle(nextEnabled);
      if (changed && nextEnabled) {
        toast.success(`${channelName} 通道已启用。`);
        return;
      }

      if (changed && !nextEnabled) {
        toast.success(`${channelName} 通道已关闭。`);
      }
    },
    [activation]
  );

  const handlePluginUninstall = useCallback(
    async (channelName: string) => {
      const uninstalled = await pluginUninstall.ensureReady();
      if (uninstalled) {
        toast.success(`${channelName} 插件已卸载。`);
      }
      return uninstalled;
    },
    [pluginUninstall]
  );

  return {
    controller,
    forceEnabled,
    pluginInstall,
    pluginUninstall,
    openConfiguration,
    handleControllerToggle,
    handlePluginUninstall,
    markForceEnabledHandled: () => setForceEnabled(false)
  };
}
