import { inspectOpenClawStatus, uninstallOpenClawPlugin } from '@/openclaw/api/client';
import { findInstalledQqbotPlugin } from '../model/qqbot-channel';
import { usePluginOperation } from '../../shared/hooks/use-plugin-operation';
import { OPENCLAW_PLUGIN_UNINSTALL_PROGRESS_EVENT } from '../../shared/hooks/use-plugin-install';

export function useQqbotPluginUninstall(configPath: string) {
  return usePluginOperation({
    eventName: OPENCLAW_PLUGIN_UNINSTALL_PROGRESS_EVENT,
    inspectInstalled: async () => {
      const status = await inspectOpenClawStatus(configPath);
      return Boolean(findInstalledQqbotPlugin(status.installedPlugins));
    },
    run: () =>
      uninstallOpenClawPlugin({
        configPath,
        pluginId: 'qqbot'
      }),
    initialProgress: {
      stage: 'checking',
      progress: 8,
      message: '正在准备卸载 QQ Bot 插件...',
      done: false,
      failed: false
    },
    dialog: {
      title: '正在卸载 QQ Bot 通道插件',
      description: '将按 OpenClaw 官方插件卸载链路移除 QQ Bot 插件，并同步清理本地安装记录。',
      idleMessage: '准备检查 QQ Bot 插件安装状态...',
      installingLabel: '正在卸载 QQ Bot 插件',
      errorLabel: '卸载未完成'
    },
    mode: 'uninstall',
    closeOnSuccess: false
  });
}
