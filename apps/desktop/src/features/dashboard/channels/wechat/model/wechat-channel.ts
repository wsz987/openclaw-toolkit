import type {
  InstalledPluginStatus,
  OpenClawPostInstallStatus,
  WeixinChannelStatus
} from '@/openclaw/model/types';

export const WECHAT_PLUGIN_PACKAGE = '@tencent-weixin/openclaw-weixin';
export const WECHAT_PLUGIN_IDS = new Set(['wechat', 'openclaw-weixin', 'weixin', 'wechat-claw']);

export function findInstalledWechatPlugin(plugins: InstalledPluginStatus[] | undefined) {
  return (
    plugins?.find((plugin) => {
      const packageName = plugin.package?.toLowerCase() ?? '';
      return WECHAT_PLUGIN_IDS.has(plugin.id.toLowerCase()) || packageName === WECHAT_PLUGIN_PACKAGE;
    }) ?? null
  );
}

export function resolveWechatChannel(status: OpenClawPostInstallStatus | null | undefined): WeixinChannelStatus | null {
  return status?.weixinChannel ?? null;
}
