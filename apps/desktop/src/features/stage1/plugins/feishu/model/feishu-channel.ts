import type {
  FeishuChannelStatus,
  InstalledPluginStatus,
  OpenClawFeishuChannelSetupPayload
} from '../../../model/types';

export const FEISHU_PLUGIN_PACKAGE = '@larksuite/openclaw-lark';
export const FEISHU_PLUGIN_IDS = new Set(['feishu', 'openclaw-lark']);

export type FeishuChannelFormState = {
  enabled: boolean;
  domain: 'feishu' | 'lark';
  connectionMode: 'websocket' | 'webhook';
  defaultAccount: string;
  accountName: string;
  appId: string;
  appSecret: string;
  dmPolicy: 'allowlist' | 'pairing' | 'open' | 'disabled';
  allowFrom: string;
  groupPolicy: 'allowlist' | 'open' | 'disabled';
  groupAllowFrom: string;
  requireMention: boolean;
  streaming: boolean;
  blockStreaming: boolean;
  typingIndicator: boolean;
  resolveSenderNames: boolean;
  verificationToken: string;
  encryptKey: string;
  webhookPath: string;
  webhookHost: string;
  webhookPort: string;
};

export function parseCsvList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createDefaultFeishuChannelFormState(): FeishuChannelFormState {
  return {
    enabled: false,
    domain: 'feishu',
    connectionMode: 'websocket',
    defaultAccount: 'default',
    accountName: '',
    appId: '',
    appSecret: '',
    dmPolicy: 'allowlist',
    allowFrom: '',
    groupPolicy: 'allowlist',
    groupAllowFrom: '',
    requireMention: true,
    streaming: true,
    blockStreaming: false,
    typingIndicator: true,
    resolveSenderNames: true,
    verificationToken: '',
    encryptKey: '',
    webhookPath: '/feishu/events',
    webhookHost: '127.0.0.1',
    webhookPort: '3000'
  };
}

export function createFeishuChannelFormState(status?: FeishuChannelStatus | null): FeishuChannelFormState {
  if (!status) {
    return createDefaultFeishuChannelFormState();
  }

  return {
    enabled: status.enabled,
    domain: status.domain === 'lark' ? 'lark' : 'feishu',
    connectionMode: status.connectionMode === 'webhook' ? 'webhook' : 'websocket',
    defaultAccount: status.defaultAccount || 'default',
    accountName: status.accountName ?? '',
    appId: status.appId ?? '',
    appSecret: status.appSecret ?? '',
    dmPolicy:
      status.dmPolicy === 'pairing' || status.dmPolicy === 'open' || status.dmPolicy === 'disabled'
        ? status.dmPolicy
        : 'allowlist',
    allowFrom: status.allowFrom.join(', '),
    groupPolicy: status.groupPolicy === 'open' || status.groupPolicy === 'disabled' ? status.groupPolicy : 'allowlist',
    groupAllowFrom: status.groupAllowFrom.join(', '),
    requireMention: status.requireMention,
    streaming: status.streaming,
    blockStreaming: status.blockStreaming,
    typingIndicator: status.typingIndicator,
    resolveSenderNames: status.resolveSenderNames,
    verificationToken: '',
    encryptKey: '',
    webhookPath: status.webhookPath ?? '/feishu/events',
    webhookHost: status.webhookHost ?? '127.0.0.1',
    webhookPort: status.webhookPort ? String(status.webhookPort) : '3000'
  };
}

export function buildFeishuChannelSetupPayload(
  configPath: string,
  state: FeishuChannelFormState
): OpenClawFeishuChannelSetupPayload {
  return {
    configPath,
    enabled: state.enabled,
    domain: state.domain,
    connectionMode: state.connectionMode,
    defaultAccount: state.defaultAccount,
    accountName: state.accountName,
    appId: state.appId,
    appSecret: state.appSecret,
    dmPolicy: state.dmPolicy,
    allowFrom: parseCsvList(state.allowFrom),
    groupPolicy: state.groupPolicy,
    groupAllowFrom: parseCsvList(state.groupAllowFrom),
    requireMention: state.requireMention,
    streaming: state.streaming,
    blockStreaming: state.blockStreaming,
    typingIndicator: state.typingIndicator,
    resolveSenderNames: state.resolveSenderNames,
    verificationToken: state.verificationToken,
    encryptKey: state.encryptKey,
    webhookPath: state.webhookPath,
    webhookHost: state.webhookHost,
    webhookPort: Number.isFinite(Number(state.webhookPort)) ? Number(state.webhookPort) : undefined
  };
}

export function buildFeishuChannelSetupPayloadFromStatus(
  configPath: string,
  status: FeishuChannelStatus,
  enabled: boolean
): OpenClawFeishuChannelSetupPayload {
  return {
    configPath,
    enabled,
    domain: status.domain,
    connectionMode: status.connectionMode,
    defaultAccount: status.defaultAccount,
    accountName: status.accountName ?? '',
    appId: status.appId ?? '',
    appSecret: '',
    dmPolicy: status.dmPolicy,
    allowFrom: status.allowFrom,
    groupPolicy: status.groupPolicy,
    groupAllowFrom: status.groupAllowFrom,
    requireMention: status.requireMention,
    streaming: status.streaming,
    blockStreaming: status.blockStreaming,
    typingIndicator: status.typingIndicator,
    resolveSenderNames: status.resolveSenderNames,
    webhookPath: status.webhookPath ?? undefined,
    webhookHost: status.webhookHost ?? undefined,
    webhookPort: status.webhookPort ?? undefined
  };
}

export function findInstalledFeishuPlugin(plugins: InstalledPluginStatus[] | undefined) {
  return (
    plugins?.find((plugin) => {
      const packageName = plugin.package?.toLowerCase() ?? '';
      return FEISHU_PLUGIN_IDS.has(plugin.id.toLowerCase()) || packageName === FEISHU_PLUGIN_PACKAGE;
    }) ?? null
  );
}

export function getFeishuPlatformLabel(domain: 'feishu' | 'lark' | string | null | undefined) {
  return domain === 'lark' ? 'Lark（国际版）' : '飞书（中国大陆）';
}
