# 飞书 Channel 官方安装链路

## 当前状态

飞书通道已不再使用项目内置 `tgz` 离线包安装。

当前正式链路改为：

```text
artifacts/plugins.json
  -> 读取 feishu 对应 installCommand
  -> 在受管 Node Runtime 环境下执行 OpenClaw 官方 plugins install
  -> 默认注入国内 npm 镜像源
  -> 核验 OpenClaw 插件注册状态
  -> 回写 installed-manifest.json.plugins
```

飞书当前安装命令为：

```text
openclaw plugins install npm:@larksuite/openclaw-lark@2026.5.20
```

## 为什么不再直接执行 `openclaw-lark install`

`@larksuite/openclaw-lark` 包自带的 `install` 子命令会进入交互式 onboarding，
在执行过程中需要人工选择：

- 新建机器人
- 关联已有机器人

桌面安装器当前是受控、非交互链路，因此不再直接调用该命令。

当前策略改为：

- 安装阶段仅负责通过 OpenClaw 官方插件管理命令完成插件包注册
- 飞书机器人的绑定与凭据配置由后续 channel 配置流程承担
- 为后续对齐 OpenClaw channels 规范保留配置式扩展位

## 配置位置

插件与 channel 安装规范统一放在：

```text
artifacts/plugins.json
```

其中：

- `plugins[]` 描述可执行的安装能力
- `channels[]` 描述 channel 侧展示和后续扩展预留

## 国内镜像源

执行官方命令时，安装器会继续注入国内 npm 镜像环境，例如：

- `registry=https://registry.npmmirror.com`
- `disturl=https://npmmirror.com/mirrors/node`
- `electron_mirror=https://npmmirror.com/mirrors/electron/`
- `playwright_download_host=https://npmmirror.com/mirrors/playwright`

因此切到官方链路后，国内部署体验保持不变。

## 后续预留

`artifacts/plugins.json` 中已预留：

- `wechat`
- `dingtalk`

待官方 OpenClaw channels 规范中的包名、入口 id、安装命令确定后，只需补充配置即可接入。
