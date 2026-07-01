import type {
  DingtalkChannelStatus,
  InstalledPluginStatus,
  OpenClawDingtalkChannelSetupPayload
} from '../../../../installer/model/types';

export const DINGTALK_PLUGIN_PACKAGE = '@dingtalk-real-ai/dingtalk-connector';
export const DINGTALK_PLUGIN_IDS = new Set(['dingtalk', 'dingtalk-connector', 'dd', 'ding']);

export type DingtalkChannelFormState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string;
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string;
  requireMention: boolean;
  streaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  groupReplyMode: 'aicard' | 'text' | 'markdown';
};

export function parseCsvList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createDefaultDingtalkChannelFormState(): DingtalkChannelFormState {
  return {
    enabled: false,
    clientId: '',
    clientSecret: '',
    dmPolicy: 'open',
    allowFrom: '*',
    groupPolicy: 'open',
    groupAllowFrom: '',
    requireMention: true,
    streaming: true,
    typingIndicator: true,
    resolveSenderNames: true,
    groupReplyMode: 'aicard'
  };
}

export function createDingtalkChannelFormState(status?: DingtalkChannelStatus | null): DingtalkChannelFormState {
  if (!status) {
    return createDefaultDingtalkChannelFormState();
  }

  return {
    enabled: status.enabled,
    clientId: status.clientId ?? '',
    clientSecret: '',
    dmPolicy:
      status.dmPolicy === 'pairing' || status.dmPolicy === 'allowlist' || status.dmPolicy === 'open'
        ? status.dmPolicy
        : 'open',
    allowFrom: status.allowFrom.length > 0 ? status.allowFrom.join(', ') : '*',
    groupPolicy:
      status.groupPolicy === 'allowlist' || status.groupPolicy === 'disabled' ? status.groupPolicy : 'open',
    groupAllowFrom: status.groupAllowFrom.join(', '),
    requireMention: status.requireMention,
    streaming: status.streaming,
    typingIndicator: status.typingIndicator,
    resolveSenderNames: status.resolveSenderNames,
    groupReplyMode:
      status.groupReplyMode === 'text' || status.groupReplyMode === 'markdown' ? status.groupReplyMode : 'aicard'
  };
}

export function buildDingtalkChannelSetupPayload(
  configPath: string,
  state: DingtalkChannelFormState
): OpenClawDingtalkChannelSetupPayload {
  return {
    configPath,
    enabled: state.enabled,
    clientId: state.clientId,
    clientSecret: state.clientSecret,
    dmPolicy: state.dmPolicy,
    allowFrom: parseCsvList(state.allowFrom),
    groupPolicy: state.groupPolicy,
    groupAllowFrom: parseCsvList(state.groupAllowFrom),
    requireMention: state.requireMention,
    streaming: state.streaming,
    typingIndicator: state.typingIndicator,
    resolveSenderNames: state.resolveSenderNames,
    groupReplyMode: state.groupReplyMode
  };
}

export function buildDingtalkChannelSetupPayloadFromStatus(
  configPath: string,
  status: DingtalkChannelStatus,
  enabled: boolean
): OpenClawDingtalkChannelSetupPayload {
  return {
    configPath,
    enabled,
    clientId: status.clientId ?? '',
    clientSecret: '',
    dmPolicy: status.dmPolicy,
    allowFrom: status.allowFrom,
    groupPolicy: status.groupPolicy,
    groupAllowFrom: status.groupAllowFrom,
    requireMention: status.requireMention,
    streaming: status.streaming,
    typingIndicator: status.typingIndicator,
    resolveSenderNames: status.resolveSenderNames,
    groupReplyMode: status.groupReplyMode
  };
}

export function findInstalledDingtalkPlugin(plugins: InstalledPluginStatus[] | undefined) {
  return (
    plugins?.find((plugin) => {
      const packageName = plugin.package?.toLowerCase() ?? '';
      return DINGTALK_PLUGIN_IDS.has(plugin.id.toLowerCase()) || packageName === DINGTALK_PLUGIN_PACKAGE;
    }) ?? null
  );
}
