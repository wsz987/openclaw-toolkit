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

关键约束：

- `artifacts/manifest.json` 应指向 `.tgz` 制品
- 安装器在 `package/node_modules` 缺失时自动执行依赖安装
- npm registry 使用国内镜像源

## 迁移说明

如果看到旧资料中提到 `-offline.zip` 或 `build:openclaw-offline`，请以当前代码实现为准，不要再恢复该链路。
