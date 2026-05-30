r# OpenClaw Toolkit Implementation Plan

## 当前状态

当前代码已切换为：

```text
Tauri v2 + React UI + Rust Core + OpenClaw 专用受管 Node Runtime
```

已完成：

- Tauri desktop workspace
- React 安装向导 UI
- Rust Core 模块结构
- Tauri command 调用入口
- Stage 1 workflow runner
- 本地/远程/npm 三种安装模式骨架
- 受管 Node Runtime 安装逻辑
- OpenClaw archive 解压安装逻辑
- 官方 npm 指定版本安装逻辑
- 远程 manifest 拉取和 `latest` 解析
- 远程制品下载
- 内部 `toolkit-settings.json` 远程地址配置
- 前端目录选择按钮
- 前端组件拆分

## Milestone 1：项目骨架（已完成）

- 初始化 Tauri desktop workspace
- 建立 React UI
- 建立 Rust Core 模块结构
- 建立 Tauri command 调用入口

## Milestone 2：Stage 1 Workflow（已完成基础版）

- 定义 Stage1InstallInput / Stage1InstallResult
- 定义 InstallStep enum
- 实现 workflow runner
- 支持前端触发安装流程
- 支持安装日志写入
- 支持已存在目录备份

## Milestone 3：Manifest 与版本锁（已完成基础版）

- 定义 toolkit manifest model
- 定义 release manifest model
- 定义 requiredNode model
- 定义 installed manifest model
- 实现 manifest 加载、校验、写入
- 新增内部 settings：`artifacts/toolkit-settings.json`

## Milestone 4：安装模式（已完成基础版）

- 本地离线包安装
- 远程服务器安装
- 官方 npm 下载指定版本安装
- 使用 OpenClaw 专用受管 Node/npm
- sha256 校验
- 签名校验预留

## Milestone 5：OpenClaw Node Runtime（已完成基础版）

- 从 manifest 解析 requiredNode
- 检查本地 Node Runtime
- 从离线包安装 Node Runtime
- 从远程服务器下载并安装 Node Runtime
- 禁止写入系统 PATH

## Milestone 6：OpenClaw 配置与 Skill（已完成基础版）

- openclaw.json 生成
- 权限配置写入
- skill 安装记录写入
- browser runtime 检测占位

## Milestone 7：前端安装向导（已完成基础版）

- 目录选择：项目资源目录、OpenClaw 安装目录
- 激活密钥输入
- 安装模式选择
- 版本输入，支持 `latest`
- 远程地址不对用户展示，由内部 settings 管理
- 组件拆分为 shadcn 风格轻量组件

说明：

- 面向最终用户的主文案应统一为 `OpenClaw 安装目录`
- 离线集成安装包场景下，安装资源目录应由程序自动定位，不建议要求用户手工填写项目根目录
- 前端主流程默认只暴露 `OpenClaw 安装目录` 一个路径输入

## Milestone 8：打包（待做）

- Tauri NSIS 安装器
- 离线 artifacts 打包
- Node Runtime 离线包打包
- WebView2 离线安装包预留

## Milestone 9：Stage 2 预留（待做）

- provider configurator 接口
- volcengine / deepseek / qwen 模块
- feishu plugin 模块

## 下一步建议

1. 把 `toolkit-settings.json` 的生成和加密/签名策略定下来。
2. 把远程下载进度和安装日志实时显示到前端。
3. 把 browser runtime 检测从占位改为真实 Edge/Chrome/Chromium 检测。
4. 接入正式离线授权验签公钥。
