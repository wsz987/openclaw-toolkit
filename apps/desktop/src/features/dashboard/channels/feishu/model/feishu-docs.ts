export const FEISHU_PLUGIN_GUIDE_URL = 'https://bytedance.larkoffice.com/docx/MFK7dDFLFoVlOGxWCv5cTXKmnMh';

export function getFeishuOpenPlatformDomain(domain: 'feishu' | 'lark' | string | null | undefined) {
  return domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
}

export function getFeishuConsoleLinks(appId: string | null | undefined, domain: 'feishu' | 'lark' | string) {
  const base = getFeishuOpenPlatformDomain(domain);
  const trimmedAppId = appId?.trim() ?? '';
  const appBase = trimmedAppId ? `${base}/app/${trimmedAppId}` : `${base}/app`;

  return {
    docs: FEISHU_PLUGIN_GUIDE_URL,
    openPlatformHome: base,
    appOverview: trimmedAppId ? appBase : `${base}/app`,
    credentials: trimmedAppId ? `${appBase}/credentials` : `${base}/app`,
    bot: trimmedAppId ? `${appBase}/bot` : `${base}/app`,
    eventSubscription: trimmedAppId ? `${appBase}/event` : `${base}/app`,
    permissions: trimmedAppId ? `${appBase}/auth?token_type=tenant` : `${base}/app`
  };
}

export const FEISHU_PERMISSION_TROUBLESHOOTING = {
  title: '在使用插件时出现权限不足，需要申请所需权限应该如何操作',
  steps: [
    '先确认报错里提到的是哪一个 scope；优先补最小权限，不要一次性全开。',
    '打开飞书开放平台应用详情页，进入「权限管理与数据范围」申请或开通对应权限。',
    '如果当前报错来自用户级授权，还需要重新发起一次授权二维码流程，让应用 owner 完成增量授权。',
    '权限开通后，回到 OpenClaw Toolkit 重新生成二维码或重试刚才的操作，验证报错是否消失。'
  ],
  copyText: [
    '权限不足处理步骤：',
    '1. 先确认报错 scope，优先申请最小权限。',
    '2. 打开飞书开放平台 -> 权限管理与数据范围，开通对应权限。',
    '3. 如果是用户级权限，还要重新发起授权二维码，让应用 owner 完成授权。',
    '4. 回到 OpenClaw Toolkit 重试操作。'
  ].join('\n')
};

export const FEISHU_PLUGIN_VERIFICATION_ITEMS = [
  {
    id: 'credentials',
    title: '凭证与基础信息',
    description: '创建自建应用后，在该页面复制 App ID 与 App Secret。',
    docLabel: '官方接入指南',
    consoleHint: '跳到当前应用凭证页'
  },
  {
    id: 'bot',
    title: '应用功能 -> 机器人',
    description: '开启机器人能力，否则插件无法以 bot 身份响应私聊或群聊。',
    docLabel: '机器人配置说明',
    consoleHint: '跳到机器人配置页'
  },
  {
    id: 'event',
    title: '开发配置 -> 事件订阅',
    description: '启用事件订阅并确认 `im.message.receive_v1` 已申请；WebSocket 模式下优先开启长连接订阅。',
    docLabel: '事件订阅说明',
    consoleHint: '跳到事件订阅页'
  },
  {
    id: 'release',
    title: '版本发布与权限开通',
    description: '机器人接入群聊/私聊前，确认应用版本和权限申请都已生效。',
    docLabel: '权限不足排查',
    consoleHint: '跳到权限管理页'
  }
] as const;
