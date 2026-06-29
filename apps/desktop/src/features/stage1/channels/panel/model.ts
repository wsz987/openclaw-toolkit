export type ChannelId = 'feishu' | 'telegram' | 'slack' | 'wechat' | 'dingtalk' | 'webhook';

export type ChannelItem = {
  id: ChannelId;
  name: string;
  type: string;
  iconName: ChannelId;
  description: string;
  drawerDescription: string;
  isUpcoming: boolean;
  colorClass: string;
  badgeBg: string;
  badgeText: string;
};

export type ChannelActionState = {
  pluginInstalled: boolean;
  pluginInstalling: boolean;
  pluginUninstalling: boolean;
  onPluginUninstall?: () => Promise<void>;
};

export type UpcomingFeature = {
  title: string;
  desc: string;
};

export const CHANNELS_LIST: ChannelItem[] = [
  {
    id: 'feishu',
    name: '飞书 / Lark',
    type: '官方通道',
    iconName: 'feishu',
    description: '支持对接飞书自建应用，包含私聊和群聊。支持 WebSocket 和 Webhook 模式。',
    drawerDescription: '配置飞书自建应用的 App ID、App Secret 与连接方式。',
    isUpcoming: false,
    colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-500'
  },
  {
    id: 'wechat',
    name: '微信 ClawBot',
    type: '官方通道',
    iconName: 'wechat',
    description: '微信官方 个人微信 ClawBot 插件。',
    drawerDescription: '检查并安装微信插件后，通过二维码完成账号绑定与通道接入。',
    isUpcoming: false,
    colorClass: 'text-green-500 bg-green-500/10 border-green-500/20',
    badgeBg: 'bg-green-500/10',
    badgeText: 'text-green-500'
  },
  {
    id: 'dingtalk',
    name: '钉钉 (DingTalk)',
    type: '官方通道',
    iconName: 'dingtalk',
    description: "钉钉官方出品的 OpenClaw 钉钉 Channel 插件。",
    drawerDescription: '配置钉钉企业内部应用的 Client ID、Client Secret 与消息策略，开启 Stream 模式机器人。',
    isUpcoming: false,
    colorClass: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    badgeBg: 'bg-orange-500/10',
    badgeText: 'text-orange-500'
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    type: '扩展通道 (规划中)',
    iconName: 'telegram',
    description: '通过 Telegram Bot API 对接，支持接收/回复个人会话及频道群组消息。',
    drawerDescription: '查看规划功能并为它投票排期。',
    isUpcoming: true,
    colorClass: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    badgeBg: 'bg-sky-500/10 border border-sky-500/20',
    badgeText: 'text-sky-500'
  }
];

export const UPCOMING_CHANNEL_FEATURES: Partial<Record<ChannelId, UpcomingFeature[]>> = {
  telegram: [
    { title: '全球代理支持', desc: '支持配置 Socks5、HTTP 代理，确保在各种服务器网络环境中皆可完美连通服务。' },
    { title: '流式实时输出', desc: '适配 Telegram 文本消息机制，支持把回答以字符流方式增量输出，减少交互迟滞感。' },
    { title: '多模态消息收发', desc: '支持接收与发送图片、音频、文档、地理位置等多种消息类型，极大拓宽交互边界。' }
  ],
  slack: [
    { title: 'Block Kit 交互组件', desc: '全面适配 Slack App Block Kit，支持丰富的原生按钮、表单、下拉框等组件交互。' },
    { title: '线程楼中楼 (Threads)', desc: '支持跟踪 Slack 里的多条回复线程，提供独立且精准的多会话上下文关联。' },
    { title: 'Slash 快捷指令', desc: '允许注册专属快捷命令（如 `/clean`），直接调用智能体底层预设技能。' }
  ],
  wechat: [
    { title: '企业通讯录关联', desc: '通过企业微信 API，自动识别并绑定内部实名用户，进行细粒度的权限分配。' },
    { title: '外部联系人/群响应', desc: '支持与外部联系人、外部群进行智能交互，实现全天候的自动客户服务。' },
    { title: '应用专属快捷菜单', desc: '可配置企业微信底部的快捷按键与自定义菜单，方便用户一键呼出核心功能。' }
  ],
  dingtalk: [
    { title: '互动卡片 (Dynamic Card)', desc: '深度对接钉钉专属互动卡片，支持卡片内状态动态变更与按钮局部刷新。' },
    { title: '单聊与群聊机器人', desc: '支持以独立聊天助手或群聊机器人的双重形态入驻钉钉，按需响应艾特消息。' },
    { title: '工作通知推送', desc: '可在后台主动向特定员工推送任务流状态更新、告警提醒等异步通知。' }
  ],
  webhook: [
    { title: '自定义通信协议', desc: '提供开放的规范，可通过自定义 Headers、验签字段，打通任意自主开发聊天工具。' },
    { title: '双向异步推送', desc: '支持同步等待返回，也支持通过持久连接或异步回调的形式把最终回答推送给第三方。' },
    { title: '多智能体路由配置', desc: '可根据传入 Webhook 请求的参数，将消息灵活路由至不同的智能体或技能组中。' }
  ]
};
