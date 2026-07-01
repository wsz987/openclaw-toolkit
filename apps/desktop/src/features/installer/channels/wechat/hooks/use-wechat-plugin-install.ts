import { inspectOpenClawStatus, installOpenClawPlugin } from '../../../api/installer-api';
import { findInstalledWechatPlugin } from '../model/wechat-channel';
import { OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT, usePluginInstall } from '../../shared/hooks/use-plugin-install';

export function useWechatPluginInstall(configPath: string) {
  return usePluginInstall({
    eventName: OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT,
    inspectInstalled: async () => {
      const status = await inspectOpenClawStatus(configPath);
      return Boolean(findInstalledWechatPlugin(status.installedPlugins));
    },
    install: () =>
      installOpenClawPlugin({
        configPath,
        pluginId: 'wechat'
      }),
    initialProgress: {
      stage: 'checking',
      progress: 8,
      message: '正在准备微信 ClawBot 插件安装...',
      done: false,
      failed: false
    },
    dialog: {
      title: '正在启用微信 ClawBot 通道',
      description: '将按腾讯微信官方 OpenClaw 插件链路安装插件，随后在应用内继续二维码登录。',
      idleMessage: '准备检查微信插件安装状态...',
      installingLabel: '正在安装微信插件',
      errorLabel: '安装未完成'
    }
  });
}
