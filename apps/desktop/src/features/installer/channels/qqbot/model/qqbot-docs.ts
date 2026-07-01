export const QQBOT_PLUGIN_GUIDE_URL = 'https://github.com/tencent-connect/openclaw-qqbot';
export const QQBOT_OPEN_PLATFORM_URL = 'https://q.qq.com/qqbot/openclaw/';
export const QQBOT_OFFICIAL_DOCS_URL = 'https://bot.q.qq.com/wiki/';
export const QQBOT_OFFICIAL_GUIDE_URL = 'https://cloud.tencent.com/developer/article/2626045';

export function getQqbotConsoleLinks(appId: string | null | undefined) {
  const trimmedAppId = appId?.trim() ?? '';
  return {
    docs: QQBOT_PLUGIN_GUIDE_URL,
    openPlatformHome: QQBOT_OPEN_PLATFORM_URL,
    officialDocs: QQBOT_OFFICIAL_DOCS_URL,
    officialGuide: QQBOT_OFFICIAL_GUIDE_URL,
    appOverview: trimmedAppId ? `${QQBOT_OPEN_PLATFORM_URL}?appid=${encodeURIComponent(trimmedAppId)}` : QQBOT_OPEN_PLATFORM_URL
  };
}

export const QQBOT_TROUBLESHOOTING = {
  title: 'QQ Bot 收发消息失败或权限不足时如何排查',
  steps: [
    '确认 AppID / AppSecret 与 QQ 开放平台机器人页面一致，避免多余空格。',
    '确认机器人已完成沙箱配置或已上线，并已添加到对应私聊、群聊或频道场景。',
    '若使用 WebSocket，确认服务器公网 IP 白名单已按 QQ 开放平台要求配置。',
    '若使用 Webhook，确认公网回调 URL 可访问，且 QQ 开放平台消息接收方式已设置为 HTTP 回调。',
    '群聊场景下确认 groupPolicy / groupAllowFrom 与 requireMention 策略允许当前群触发。'
  ],
  copyText: [
    'QQ Bot 排查步骤：',
    '1. 核对 AppID / AppSecret。',
    '2. 确认机器人已配置沙箱或上线，并添加到目标场景。',
    '3. WebSocket 模式检查 IP 白名单。',
    '4. Webhook 模式检查公网回调 URL。',
    '5. 群聊检查 groupPolicy / groupAllowFrom / requireMention。'
  ].join('\n')
};
