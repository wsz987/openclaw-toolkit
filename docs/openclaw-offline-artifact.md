# OpenClaw Offline Artifact Legacy Note

本文档保留为历史说明。

## 已废弃链路

以下旧链路已经停用，不再作为正式交付方式：

- `npm run build:openclaw-offline`
- `node scripts/build-openclaw-offline.mjs`
- `openclaw-<version>-offline.zip`

对应原因：

- 这条链路依赖建机预构建 `node_modules`
- 产物体积过大
- 安装器已经改为直接消费官方 `openclaw-<version>.tgz`
- 依赖补装已下沉到桌面安装器内部完成

## 当前正式链路

当前安装链路如下：

```text
artifacts/openclaw/openclaw-<version>.tgz
  -> Tauri 安装器解压
  -> 使用受管 Node Runtime
  -> 通过国内 npm 镜像补装运行依赖
  -> 启动 package/openclaw.mjs
```

Stage 2 插件扩展（例如飞书通道插件）目前不再走内置 `tgz`：

- 插件安装规范统一由 `artifacts/plugins.json` 描述
- 优先执行 OpenClaw 官方 `plugins install` / channel install 链路
- 安装命令运行在受管 Node Runtime 环境中
- 依赖下载继续使用国内 npm 镜像源

补充说明：

- 对于 `@larksuite/openclaw-lark` 这类插件包，不再直接调用其自带 `install` onboarding 命令
- 桌面端安装阶段只负责插件包注册，避免卡在交互式“新建机器人 / 关联已有机器人”
- 后续 channel 配置、授权与机器人绑定由独立配置步骤处理

关键约束：

- `artifacts/manifest.json` 仍用于主 OpenClaw 安装制品
- `artifacts/plugins.json` 用于 channel / plugin 安装规范
- 安装器在 `package/node_modules` 缺失时自动执行依赖安装
- npm registry 使用国内镜像源

## 迁移说明

如果看到旧资料中提到 `-offline.zip` 或 `build:openclaw-offline`，请以当前代码实现为准，不要再恢复该链路。
