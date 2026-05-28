# OpenClaw 国网离线集成工具包架构计划

## 目标

本项目面向 Windows 国网内网、强隔离、弱外网或无外网环境，提供 OpenClaw 执行环境的自动化部署、版本管理、权限配置和插件安装能力。

核心方案：

```text
Tauri v2 桌面壳 + Rust Core + OpenClaw 专用受管 Node Runtime + Manifest 版本锁 + 离线授权 + 插件化 Step 流程
```

## 核心原则

工具包自身不内置 Node Core，不要求用户全局安装 Node.js，也不把 Node.js 写入系统 PATH。

Node.js 只作为 OpenClaw 的受管运行环境存在：

```text
Tauri/Rust = 工具包自身
Managed Node Runtime = OpenClaw 运行环境
OpenClaw Package + Skills = 被工具包安装和管理的目标环境
```

## 阶段范围

### Stage 1：当前实现重点

- Windows Tauri 桌面安装器
- Rust Core 安装、配置、授权和版本管理
- 离线激活密钥校验
- 三种安装模式：本地离线包、内部配置的远程服务器、官方 npm 下载指定版本
- OpenClaw 版本锁定
- OpenClaw 专用 Node Runtime 版本锁定
- openclaw.json 自动生成
- Skill 插件安装
- 本地权限白名单配置
- 浏览器控制环境检测
- 安装日志、状态记录和失败回滚

### Stage 2：预留扩展

- DeepSeek / Qwen / 火山引擎 Ark 等 OpenAI-compatible provider 配置
- API 连通性验证
- 飞书插件配置
- 飞书权限清单生成
- 飞书 SDK 凭证验证

## 进程架构

```text
Tauri Desktop UI
  ├─ React / Vite / Tailwind / shadcn/ui
  ├─ 只负责展示、表单、进度、日志
  └─ 通过 Tauri invoke 调用 Rust Core command

Tauri Rust Core
  ├─ Windows 安装器
  ├─ 管理员权限声明
  ├─ Workflow Engine
  ├─ Manifest Manager
  ├─ License Verifier
  ├─ Artifact Installer
  ├─ OpenClaw Config Writer
  ├─ Node Runtime Manager
  ├─ Skill Installer
  ├─ Permission Manager
  └─ OpenClaw Process Manager

OpenClaw Managed Runtime
  ├─ D:\OpenClaw\runtimes\node\<node-version>\node.exe
  ├─ D:\OpenClaw\openclaw\<openclaw-version>\
  ├─ D:\OpenClaw\skills\
  ├─ D:\OpenClaw\workspace\
  ├─ D:\OpenClaw\logs\
  └─ D:\OpenClaw\backups\
```

## Node.js Runtime 策略

Node.js 不属于工具包自身运行时，而是 OpenClaw 的被管理运行时。每个 OpenClaw release 在 manifest 中声明 requiredNode。

```json
{
  "version": "1.2.1",
  "requiredNode": {
    "version": "20.11.1",
    "range": ">=20 <21",
    "artifact": "node-v20.11.1-win-x64.zip",
    "sha256": "..."
  }
}
```

安装时：

```text
选择 OpenClaw 版本
  -> 解析 requiredNode
  -> 检查本机受管 Node Runtime
  -> 没有则安装 Node Runtime
  -> 使用该 Node/npm 安装或运行 OpenClaw
```

官方 npm 模式也必须使用受管 Node/npm：

```text
D:\OpenClaw\runtimes\node\20.11.1-win-x64\npm.cmd install openclaw@1.2.1 --prefix D:\OpenClaw\openclaw\1.2.1
```

禁止：

- 安装全局 Node.js
- 修改系统 PATH
- 使用系统全局 npm
- 使用 `npm install -g`

## 目录结构

```text
apps/desktop                 Tauri + React + Rust Core
artifacts                    离线制品目录
artifacts/openclaw           OpenClaw 离线包
artifacts/node               Node Runtime 离线包
artifacts/skills             Skill 离线包
templates                    openclaw 和权限模板
scripts                      打包、签名、构建脚本
docs                         架构和部署文档
```

## Workflow 设计

Rust Core 使用简单、显式的 Step enum 和 handler，不引入过重状态机库。每个 step 单独模块，流程由 workflow runner 串联。

```rust
pub enum InstallStep {
    LoadManifest,
    ValidateLicense,
    CheckEnvironment,
    SelectInstallMode,
    ResolveOpenClawVersion,
    ResolveNodeRuntime,
    InstallNodeRuntime,
    ResolveOpenClawArtifact,
    InstallOpenClaw,
    WriteInstalledManifest,
    GenerateOpenClawConfig,
    InstallSkills,
    ConfigurePermissions,
    ConfigureBrowser,
    VerifyRuntime,
}
```

一阶段主流程：

```text
loadManifest
  -> validateLicense
  -> checkEnvironment
  -> selectInstallMode
  -> resolveOpenClawVersion
  -> resolveNodeRuntime
  -> installNodeRuntime
  -> resolveOpenClawArtifact
  -> installOpenClaw
  -> writeInstalledManifest
  -> generateOpenClawConfig
  -> installSkills
  -> configurePermissions
  -> configureBrowser
  -> verifyRuntime
  -> finished
```

失败策略：

- 安装前备份 runtime
- 写配置前备份 openclaw.json
- 安装失败进入 rollback
- rollback 失败时保留日志和现场

## 版本管理

### toolkit manifest

描述工具包自身能力、支持的 OpenClaw 版本和默认版本。

### release manifest

描述可安装 OpenClaw 制品、requiredNode、平台、sha256、签名、关联 skills。

### installed manifest

记录本机已安装状态，包含工具包版本、OpenClaw 版本、Node Runtime 版本、安装方式、运行目录、配置路径和 skills 列表。

## 授权设计

使用离线授权，不自定义易伪造格式。

- 生成端使用私钥签名
- 客户端 Rust Core 内置公钥
- Rust Core 离线验签
- license payload 决定 tier、features、过期时间和可安装版本范围

Stage 1 features：

- offline-install
- remote-artifact-install
- official-npm-install
- managed-node-runtime
- local-skills
- browser-control

Stage 2 features：

- cloud-providers
- provider-verification
- feishu-plugin

## 权限设计

Tauri NSIS 安装器使用 `requireAdministrator`。管理员权限用于安装、服务注册、浏览器自动化和受限目录写入。

但 OpenClaw Agent 权限必须由 openclaw.json 白名单约束：

- filesystem allowRead / allowWrite / deny
- shell allowCommands / denyPatterns
- browser allowDomains
- skill 权限声明

## 配置生成

openclaw.json 不直接字符串拼接，使用：

```text
模板 + serde 结构体校验 + merge + 备份写入
```

## 维护原则

- 前端只展示用户需要选择的目录、版本、安装模式和激活密钥
- 工具包自身不依赖 Node.js
- Node.js 只作为 OpenClaw 运行环境被管理
- 流程定义在 Rust workflow
- 每个能力是独立 step handler
- 每个配置结构都有 serde model
- 每个制品都由 manifest 管理
- 新增二阶段能力只新增 provider/plugin step，不重写主流程
