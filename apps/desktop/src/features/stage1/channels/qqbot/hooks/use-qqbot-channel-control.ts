import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { QqbotPluginPanelProps } from '../components/qqbot-plugin-panel';
import { createQqbotChannelController } from '../model/qqbot-channel-controller';
import { useQqbotPluginInstall } from './use-qqbot-plugin-install';
import { useQqbotPluginUninstall } from './use-qqbot-plugin-uninstall';
import { useChannelActivation } from '../../shared/hooks/use-channel-activation';

export type UseQqbotChannelControlResult = {
  controller: ReturnType<typeof createQqbotChannelController>;
  forceEnabled: boolean;
  pluginInstall: ReturnType<typeof useQqbotPluginInstall>;
  pluginUninstall: ReturnType<typeof useQqbotPluginUninstall>;
  openConfiguration: (forceEnabled?: boolean) => void;
  handleControllerToggle: (channelName: string, nextEnabled: boolean) => Promise<void>;
  handlePluginUninstall: (channelName: string) => Promise<boolean>;
  markForceEnabledHandled: () => void;
};

export function useQqbotChannelControl(props: QqbotPluginPanelProps): UseQqbotChannelControlResult {
  const [forceEnabled, setForceEnabled] = useState(false);
  const pluginInstall = useQqbotPluginInstall(props.result.configPath);
  const pluginUninstall = useQqbotPluginUninstall(props.result.configPath);

  const openConfiguration = useCallback((nextForceEnabled = false) => {
    if (nextForceEnabled) {
      setForceEnabled(true);
    }
  }, []);

  const controller = createQqbotChannelController({
    result: props.result,
    status: props.status,
    loading:
      props.statusLoading ||
      props.qqbotSetupLoading ||
      pluginInstall.installing ||
      pluginUninstall.installing ||
      pluginInstall.checking ||
      pluginUninstall.checking ||
      Boolean(props.loginBusy),
    ensureReady: pluginInstall.ensureReady,
    onQqbotChannelSetup: props.onQqbotChannelSetup,
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
