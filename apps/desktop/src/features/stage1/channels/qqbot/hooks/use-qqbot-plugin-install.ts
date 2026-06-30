import { inspectOpenClawStatus, installOpenClawPlugin } from '../../../api/stage1-api';
import { findInstalledQqbotPlugin } from '../model/qqbot-channel';
import { OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT, usePluginInstall } from '../../shared/hooks/use-plugin-install';

export function useQqbotPluginInstall(configPath: string) {
  return usePluginInstall({
    eventName: OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT,
    inspectInstalled: async () => {
      const status = await inspectOpenClawStatus(configPath);
      return Boolean(findInstalledQqbotPlugin(status.installedPlugins));
    },
    install: () =>
      installOpenClawPlugin({
        configPath,
        pluginId: 'qqbot'
      }),
    initialProgress: {
      stage: 'checking',
      progress: 8,
      message: '正在准备 QQ Bot 插件安装...',
      done: false,
      failed: false
    },
    dialog: {
      title: '正在启用 QQ Bot 通道',
      description: '将按腾讯 QQ 官方 OpenClaw 插件链路安装插件，随后打开 QQ 开放平台获取 AppID / AppSecret 并配置。',
      idleMessage: '准备检查 QQ Bot 插件安装状态...',
      installingLabel: '正在安装 QQ Bot 插件',
      errorLabel: '安装未完成'
    }
  });
}
