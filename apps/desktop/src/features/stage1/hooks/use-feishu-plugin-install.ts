import { inspectOpenClawStatus, installOpenClawPlugin } from '../api/stage1-api';
import { findInstalledFeishuPlugin } from '../model/feishu-channel';
import { usePluginInstall } from './use-plugin-install';

export function useFeishuPluginInstall(configPath: string) {
  return usePluginInstall({
    eventName: 'openclaw://feishu-plugin-install-progress',
    inspectInstalled: async () => {
      const status = await inspectOpenClawStatus(configPath);
      return Boolean(findInstalledFeishuPlugin(status.installedPlugins));
    },
    install: () =>
      installOpenClawPlugin({
        configPath,
        pluginId: 'feishu'
      }),
    initialProgress: {
      stage: 'checking',
      progress: 8,
      message: '正在准备飞书插件安装...',
      done: false,
      failed: false
    },
    dialog: {
      title: '正在启用飞书通道',
      description: '检查到飞书插件未就绪时，会自动完成安装，然后继续后续配置。',
      idleMessage: '准备检查飞书插件安装状态...',
      installingLabel: '正在安装飞书插件',
      errorLabel: '安装未完成'
    }
  });
}
