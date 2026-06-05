# 飞书插件离线安装设计

## 定位

本能力属于 Stage 2 插件能力，不并入 Stage 1 主安装流程。

职责边界：

- Stage 1：安装 OpenClaw 主程序、受管 Node Runtime、基础配置、Skills
- Stage 2：按需安装 Provider / Channel / Plugin 扩展能力

当前飞书插件采用：

```text
官方 npm tgz 制品
  -> 工具包内置到 artifacts/plugins/<plugin-id>/
  -> 受管 Node Runtime 在 openclaw/package 下执行 npm install <local-tgz>
  -> 国内 npm 镜像补齐依赖
  -> 配置层启用 plugins.entries + channels.feishu
```

## 目录规范

新增资源目录：

```text
artifacts/plugins/
  <plugin-id>/
    <package-artifact>.tgz
artifacts/plugins.json
```

飞书插件示例：

```text
artifacts/plugins/feishu/larksuite-openclaw-lark-2026.5.20.tgz
```

说明：

- `<plugin-id>` 是工具包内部安装能力 id，例如 `feishu`
- `pluginEntryId` 是 OpenClaw 插件真实 entry id，例如 `openclaw-lark`
- 配置 channel 仍使用 `channels.feishu`

## Manifest 结构

`artifacts/plugins.json` 负责描述插件离线制品、兼容范围和实际插件 entry id。

关键字段：

- `id`: 工具包内部插件能力 id
- `package`: npm 包名
- `version`: 离线插件版本
- `artifact`: 本地 tgz 文件名
- `sha256`: 本地文件哈希
- `pluginEntryId`: OpenClaw 运行时识别的插件 id
- `aliases`: 兼容别名
- `openClawVersionRange`: 允许安装到哪些 OpenClaw 版本
- `nodeVersionRange`: 允许安装到哪些 Node 版本

## 安装策略

安装命令入口放在 `post_install` 层，而不是 Stage 1 workflow。

原因：

- 飞书插件属于扩展能力
- 需要独立授权 feature gate
- 不应影响无飞书需求的基础安装闭环

安装时：

1. 从 `installed-manifest.json` 读取当前实例的 OpenClaw / Node 版本
2. 校验插件 manifest 中声明的兼容范围
3. 校验本地 tgz sha256
4. 使用受管 `npm.cmd` 在 `openclaw/package` 目录执行本地 tgz 安装
5. 更新 `installed-manifest.json.plugins`
6. 标记 runtime 需要重启

## 配置兼容

当前项目历史上把飞书插件 entry 写作 `plugins.entries.feishu`。

但官方插件 `@larksuite/openclaw-lark@2026.5.20` 的 `openclaw.plugin.json` 中：

- `id = openclaw-lark`
- `channels = ["feishu"]`

因此配置层采用兼容写法：

- 继续保留 `plugins.entries.feishu`
- 同时写入 `plugins.entries.openclaw-lark`
- 状态读取时两者都识别

这样可以兼容已有 UI 和后续官方插件真实 entry id。
