import { inspectOpenClawStatus, installOpenClawPlugin } from '@/openclaw/api/client';
import { findInstalledDingtalkPlugin } from '../model/dingtalk-channel';
import { OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT, usePluginInstall } from '../../shared/hooks/use-plugin-install';

export function useDingtalkPluginInstall(configPath: string) {
  return usePluginInstall({
    eventName: OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT,
    inspectInstalled: async () => {
      const status = await inspectOpenClawStatus(configPath);
      return Boolean(findInstalledDingtalkPlugin(status.installedPlugins));
    },
    install: () =>
      installOpenClawPlugin({
        configPath,
        pluginId: 'dingtalk'
      }),
    initialProgress: {
      stage: 'checking',
      progress: 8,
      message: '正在准备钉钉插件安装...',
      done: false,
      failed: false
    },
    dialog: {
      title: '正在启用钉钉通道',
      description: '检查到钉钉插件未就绪时，会自动完成安装，然后继续后续配置。',
      idleMessage: '准备检查钉钉插件安装状态...',
      installingLabel: '正在安装钉钉插件',
      errorLabel: '安装未完成'
    }
  });
}
