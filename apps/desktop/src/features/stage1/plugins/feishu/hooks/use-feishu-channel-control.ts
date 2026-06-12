import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { FeishuPluginPanelProps } from '../components/feishu-plugin-panel';
import { createFeishuChannelController } from '../model/feishu-channel-controller';
import { useFeishuPluginInstall } from './use-feishu-plugin-install';
import { useFeishuPluginUninstall } from './use-feishu-plugin-uninstall';
import { useChannelActivation } from '../../shared/hooks/use-channel-activation';

type UseFeishuChannelControlResult = {
  controller: ReturnType<typeof createFeishuChannelController>;
  forceEnabled: boolean;
  pluginInstall: ReturnType<typeof useFeishuPluginInstall>;
  pluginUninstall: ReturnType<typeof useFeishuPluginUninstall>;
  openConfiguration: (forceEnabled?: boolean) => void;
  handleControllerToggle: (channelName: string, nextEnabled: boolean) => Promise<void>;
  handlePluginUninstall: (channelName: string) => Promise<boolean>;
  markForceEnabledHandled: () => void;
};

export function useFeishuChannelControl(props: FeishuPluginPanelProps): UseFeishuChannelControlResult {
  const [forceEnabled, setForceEnabled] = useState(false);
  const pluginInstall = useFeishuPluginInstall(props.result.configPath);
  const pluginUninstall = useFeishuPluginUninstall(props.result.configPath);

  const openConfiguration = useCallback((nextForceEnabled = false) => {
    if (nextForceEnabled) {
      setForceEnabled(true);
    }
  }, []);

  const controller = createFeishuChannelController({
    result: props.result,
    status: props.status,
    loading:
      props.statusLoading ||
      props.feishuSetupLoading ||
      pluginInstall.installing ||
      pluginUninstall.installing ||
      pluginInstall.checking ||
      pluginUninstall.checking,
    ensureReady: pluginInstall.ensureReady,
    onFeishuChannelSetup: props.onFeishuChannelSetup,
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
