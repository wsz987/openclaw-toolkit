import type { ChannelController } from '../../shared/model/channel-controller';
import type {
  OpenClawDingtalkChannelSetupResult,
  OpenClawPostInstallStatus,
  OpenClawInstallResult
} from '../../../model/types';
import { buildDingtalkChannelSetupPayloadFromStatus } from './dingtalk-channel';

type CreateDingtalkChannelControllerOptions = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  loading: boolean;
  ensureReady: () => Promise<boolean>;
  onDingtalkChannelSetup: (
    input: ReturnType<typeof buildDingtalkChannelSetupPayloadFromStatus>
  ) => Promise<OpenClawDingtalkChannelSetupResult | null>;
  openConfiguration: () => void;
};

export function createDingtalkChannelController({
  result,
  status,
  loading,
  ensureReady,
  onDingtalkChannelSetup,
  openConfiguration
}: CreateDingtalkChannelControllerOptions): ChannelController {
  const dingtalkStatus = status?.dingtalkChannel;

  return {
    id: 'dingtalk',
    enabled: Boolean(dingtalkStatus?.enabled),
    configured: Boolean(dingtalkStatus?.configured),
    loading,
    ensureReady,
    enable: async () => {
      if (!dingtalkStatus) {
        openConfiguration();
        return false;
      }

      const response = await onDingtalkChannelSetup(
        buildDingtalkChannelSetupPayloadFromStatus(result.configPath, dingtalkStatus, true)
      );
      return Boolean(response);
    },
    disable: async () => {
      if (!dingtalkStatus) {
        return false;
      }

      const response = await onDingtalkChannelSetup(
        buildDingtalkChannelSetupPayloadFromStatus(result.configPath, dingtalkStatus, false)
      );
      return Boolean(response);
    },
    openConfiguration
  };
}
