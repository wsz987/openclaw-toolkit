export const DINGTALK_PLUGIN_GUIDE_URL = 'https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector';

export const DINGTALK_OPEN_PLATFORM_BASE_URL = 'https://open-dev.dingtalk.com';

export function getDingtalkConsoleLinks(clientId: string | null | undefined) {
  const trimmedClientId = clientId?.trim() ?? '';
  const appBase = trimmedClientId
    ? `${DINGTALK_OPEN_PLATFORM_BASE_URL}/#/app?clientId=${encodeURIComponent(trimmedClientId)}`
    : `${DINGTALK_OPEN_PLATFORM_BASE_URL}/#/app`;

  return {
    docs: DINGTALK_PLUGIN_GUIDE_URL,
    openPlatformHome: DINGTALK_OPEN_PLATFORM_BASE_URL,
    appOverview: appBase,
    credentials: trimmedClientId
      ? `${DINGTALK_OPEN_PLATFORM_BASE_URL}/#/app?clientId=${encodeURIComponent(trimmedClientId)}&menu=base`
      : appBase,
    bot: trimmedClientId
      ? `${DINGTALK_OPEN_PLATFORM_BASE_URL}/#/app?clientId=${encodeURIComponent(trimmedClientId)}&menu=robot`
      : appBase,
    permissions: trimmedClientId
      ? `${DINGTALK_OPEN_PLATFORM_BASE_URL}/#/app?clientId=${encodeURIComponent(trimmedClientId)}&menu=auth`
      : appBase
  };
}

export const DINGTALK_PERMISSION_TROUBLESHOOTING = {
  title: '钉钉机器人收发消息失败或权限不足时如何排查',
  steps: [
    '在钉钉开发者后台确认应用已开启「机器人」能力，并配置消息接收模式为 Stream 模式。',
    '检查 Client ID（AppKey）与 Client Secret（AppSecret）是否与开发者后台一致，避免多余空格。',
    '确认应用已发布且版本生效；企业内部应用需要确认可见范围包含目标用户/群。',
    '群聊场景下确认机器人已加入目标群，并按需 @机器人；私聊确认 dmPolicy 允许当前用户。'
  ],
  copyText: [
    '钉钉机器人排查步骤：',
    '1. 开发者后台确认「机器人」能力开启，消息接收模式为 Stream。',
    '2. 核对 Client ID / Client Secret 是否正确。',
    '3. 应用已发布且版本生效，可见范围包含目标用户/群。',
    '4. 群聊确认机器人已入群并 @机器人；私聊确认 dmPolicy 允许该用户。'
  ].join('\n')
};

export const DINGTALK_PLUGIN_VERIFICATION_ITEMS = [
  {
    id: 'credentials',
    title: '应用凭证与基础信息',
    description: '在钉钉开发者后台创建企业内部应用，复制 AppKey（Client ID）与 AppSecret（Client Secret）。',
    docLabel: '官方接入指南',
    consoleHint: '跳到应用凭证页'
  },
  {
    id: 'bot',
    title: '应用能力 -> 机器人',
    description: '开启机器人能力，否则插件无法以 bot 身份响应私聊或群聊消息。',
    docLabel: '机器人配置说明',
    consoleHint: '跳到机器人配置页'
  },
  {
    id: 'stream',
    title: '消息接收模式 -> Stream',
    description: '将消息接收模式设置为 Stream（长连接），无需公网 IP 即可接收事件，适合桌面客户端。',
    docLabel: 'Stream 模式说明',
    consoleHint: '跳到机器人配置页'
  },
  {
    id: 'release',
    title: '版本发布与可见范围',
    description: '发布应用版本并配置可见范围，确认目标用户/群在可见范围内，机器人才能正常响应。',
    docLabel: '权限不足排查',
    consoleHint: '跳到权限管理页'
  }
] as const;
