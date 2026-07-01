import type { ChannelController } from '../../shared/model/channel-controller';
import type {
  OpenClawFeishuChannelSetupResult,
  OpenClawPostInstallStatus,
  OpenClawInstallResult
} from '../../../../installer/model/types';
import { buildFeishuChannelSetupPayloadFromStatus } from './feishu-channel';

type CreateFeishuChannelControllerOptions = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  loading: boolean;
  ensureReady: () => Promise<boolean>;
  onFeishuChannelSetup: (
    input: ReturnType<typeof buildFeishuChannelSetupPayloadFromStatus>
  ) => Promise<OpenClawFeishuChannelSetupResult | null>;
  openConfiguration: () => void;
};

export function createFeishuChannelController({
  result,
  status,
  loading,
  ensureReady,
  onFeishuChannelSetup,
  openConfiguration
}: CreateFeishuChannelControllerOptions): ChannelController {
  const feishuStatus = status?.feishuChannel;

  return {
    id: 'feishu',
    enabled: Boolean(feishuStatus?.enabled),
    configured: Boolean(feishuStatus?.configured),
    loading,
    ensureReady,
    enable: async () => {
      if (!feishuStatus) {
        openConfiguration();
        return false;
      }

      const response = await onFeishuChannelSetup(
        buildFeishuChannelSetupPayloadFromStatus(result.configPath, feishuStatus, true)
      );
      return Boolean(response);
    },
    disable: async () => {
      if (!feishuStatus) {
        return false;
      }

      const response = await onFeishuChannelSetup(
        buildFeishuChannelSetupPayloadFromStatus(result.configPath, feishuStatus, false)
      );
      return Boolean(response);
    },
    openConfiguration
  };
}
