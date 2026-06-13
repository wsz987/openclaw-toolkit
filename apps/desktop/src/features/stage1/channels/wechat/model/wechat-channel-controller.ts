import type { ChannelController } from '../../shared/model/channel-controller';
import type { OpenClawPostInstallStatus, Stage1InstallResult } from '../../../model/types';
import { setWeixinChannelEnabled } from '../../../api/stage1-api';

type CreateWechatChannelControllerOptions = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  loading: boolean;
  ensureReady: () => Promise<boolean>;
  openConfiguration: () => void;
};

export function createWechatChannelController({
  result,
  status,
  loading,
  ensureReady,
  openConfiguration
}: CreateWechatChannelControllerOptions): ChannelController {
  const wechatStatus = status?.weixinChannel;

  return {
    id: 'wechat',
    enabled: Boolean(wechatStatus?.enabled),
    configured: Boolean(wechatStatus?.configured),
    loading,
    ensureReady,
    enable: async () => {
      if (!wechatStatus?.configured) {
        openConfiguration();
        return false;
      }

      const response = await setWeixinChannelEnabled({
        configPath: result.configPath,
        enabled: true
      });
      return Boolean(response.enabled);
    },
    disable: async () => {
      const response = await setWeixinChannelEnabled({
        configPath: result.configPath,
        enabled: false
      });
      return !response.enabled;
    },
    openConfiguration
  };
}
