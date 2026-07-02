import type { ChannelController } from '../../shared/model/channel-controller';
import type {
  OpenClawPostInstallStatus,
  OpenClawQqbotChannelSetupResult,
  OpenClawInstallResult
} from '@/openclaw/model/types';
import { buildQqbotChannelSetupPayloadFromStatus } from './qqbot-channel';

export type CreateQqbotChannelControllerOptions = {
  result: OpenClawInstallResult;
  status: OpenClawPostInstallStatus | null;
  loading: boolean;
  ensureReady: () => Promise<boolean>;
  onQqbotChannelSetup: (
    input: ReturnType<typeof buildQqbotChannelSetupPayloadFromStatus>
  ) => Promise<OpenClawQqbotChannelSetupResult | null>;
  openConfiguration: () => void;
};

export function createQqbotChannelController({
  result,
  status,
  loading,
  ensureReady,
  onQqbotChannelSetup,
  openConfiguration
}: CreateQqbotChannelControllerOptions): ChannelController {
  const qqbotStatus = status?.qqbotChannel;

  return {
    id: 'qqbot',
    enabled: Boolean(qqbotStatus?.enabled),
    configured: Boolean(qqbotStatus?.configured),
    loading,
    ensureReady,
    enable: async () => {
      if (!qqbotStatus || !qqbotStatus.configured) {
        openConfiguration();
        return false;
      }

      const response = await onQqbotChannelSetup(
        buildQqbotChannelSetupPayloadFromStatus(result.configPath, qqbotStatus, true)
      );
      return Boolean(response);
    },
    disable: async () => {
      if (!qqbotStatus) {
        return false;
      }

      const response = await onQqbotChannelSetup(
        buildQqbotChannelSetupPayloadFromStatus(result.configPath, qqbotStatus, false)
      );
      return Boolean(response);
    },
    openConfiguration
  };
}
