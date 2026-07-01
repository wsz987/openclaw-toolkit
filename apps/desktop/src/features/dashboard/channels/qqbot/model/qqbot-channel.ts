import type {
  InstalledPluginStatus,
  OpenClawPostInstallStatus,
  OpenClawQqbotChannelSetupPayload,
  QqbotChannelStatus
} from '../../../../installer/model/types';

export const QQBOT_PLUGIN_PACKAGE = '@tencent-connect/openclaw-qqbot';
export const QQBOT_PLUGIN_IDS = new Set(['qqbot', 'openclaw-qqbot', 'qq']);

export type QqbotChannelFormState = {
  enabled: boolean;
  appId: string;
  clientSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string;
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string;
  defaultRequireMention: boolean;
  transport: 'websocket' | 'webhook';
};

export function parseCsvList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createDefaultQqbotChannelFormState(): QqbotChannelFormState {
  return {
    enabled: false,
    appId: '',
    clientSecret: '',
    dmPolicy: 'open',
    allowFrom: '*',
    groupPolicy: 'open',
    groupAllowFrom: '',
    defaultRequireMention: true,
    transport: 'websocket'
  };
}

export function createQqbotChannelFormState(status?: QqbotChannelStatus | null): QqbotChannelFormState {
  if (!status) {
    return createDefaultQqbotChannelFormState();
  }

  return {
    enabled: status.enabled,
    appId: status.appId ?? '',
    clientSecret: '',
    dmPolicy:
      status.dmPolicy === 'pairing' || status.dmPolicy === 'allowlist' || status.dmPolicy === 'open'
        ? status.dmPolicy
        : 'open',
    allowFrom: status.allowFrom.length > 0 ? status.allowFrom.join(', ') : '*',
    groupPolicy: status.groupPolicy === 'allowlist' || status.groupPolicy === 'disabled' ? status.groupPolicy : 'open',
    groupAllowFrom: status.groupAllowFrom.join(', '),
    defaultRequireMention: status.defaultRequireMention,
    transport: status.transport === 'webhook' ? 'webhook' : 'websocket'
  };
}

export function buildQqbotChannelSetupPayload(
  configPath: string,
  state: QqbotChannelFormState
): OpenClawQqbotChannelSetupPayload {
  return {
    configPath,
    enabled: state.enabled,
    appId: state.appId,
    clientSecret: state.clientSecret,
    dmPolicy: state.dmPolicy,
    allowFrom: parseCsvList(state.allowFrom),
    groupPolicy: state.groupPolicy,
    groupAllowFrom: parseCsvList(state.groupAllowFrom),
    defaultRequireMention: state.defaultRequireMention,
    transport: state.transport
  };
}

export function buildQqbotChannelSetupPayloadFromStatus(
  configPath: string,
  status: QqbotChannelStatus,
  enabled: boolean
): OpenClawQqbotChannelSetupPayload {
  return {
    configPath,
    enabled,
    appId: status.appId ?? '',
    clientSecret: '',
    dmPolicy: status.dmPolicy,
    allowFrom: status.allowFrom,
    groupPolicy: status.groupPolicy,
    groupAllowFrom: status.groupAllowFrom,
    defaultRequireMention: status.defaultRequireMention,
    transport: status.transport
  };
}

export function findInstalledQqbotPlugin(plugins: InstalledPluginStatus[] | undefined) {
  return (
    plugins?.find((plugin) => {
      const packageName = plugin.package?.toLowerCase() ?? '';
      return QQBOT_PLUGIN_IDS.has(plugin.id.toLowerCase()) || packageName === QQBOT_PLUGIN_PACKAGE;
    }) ?? null
  );
}

export function resolveQqbotChannel(status: OpenClawPostInstallStatus | null | undefined): QqbotChannelStatus | null {
  return status?.qqbotChannel ?? null;
}
