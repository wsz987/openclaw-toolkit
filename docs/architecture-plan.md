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

离线集成安装包作为默认发布形态时，`artifacts`、`manifest`、`templates` 等安装资源应由安装器自动定位，不应要求最终用户手动指定项目根目录。最终用户主要需要确认的是 `OpenClaw 安装目录`，即受管 Node Runtime、OpenClaw 主程序、配置、日志和备份的落盘根路径。

资源目录解析建议顺序：

- 显式指定的开发态目录
- `OPENCLAW_TOOLKIT_ROOT` 环境变量
- 安装器当前工作目录及其上级目录
- 安装器可执行文件所在目录及其上级目录

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
- Agent 工具策略配置
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

对用户暴露的目录建议统一使用 `OpenClaw 安装目录` 这一表述；`基础目录`、`部署基础目录` 属于内部实现概念，不建议继续作为主界面文案。

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
artifacts/plugins            Plugin 离线包
artifacts/skills             Skill 离线包
templates                    openclaw 和权限模板
scripts                      打包、签名、构建脚本
docs                         架构和部署文档
```

对于集成安装包：

- 安装资源目录由程序内部自动解析
- 用户界面默认只需要配置 `OpenClaw 安装目录`
- 无论是本地离线包、远程源还是官方 npm 安装，最终都统一部署到该目录下

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

### installation registry

除实例目录内部的 `installed-manifest` 外，还应新增“应用级安装注册中心”，并放在 Tauri 应用数据目录，而不是放在 `OpenClaw 安装目录` 内。

registry 负责：

- 持久化最近一次安装成功的实例
- 记录当前激活实例与最近使用目录
- 支持多安装实例发现与切换
- 记录失败中、待恢复、已损坏实例
- 为应用启动后的状态恢复提供唯一入口

建议数据分层：

- `settings.json`：用户偏好、最近目录、activeInstallationId
- `install-registry.json`：安装实例索引和状态
- `installed-manifest.json`：具体安装目录内的自描述文件

仅依赖默认 `OpenClaw 安装目录` 推断安装状态不可接受；安装识别必须以 registry + manifest 校验为准。

## 启动恢复设计

应用启动后不应直接进入安装向导，而应先执行 bootstrap：

```text
load settings
  -> load install registry
  -> locate active installation
  -> validate paths / manifest / config / runtime
  -> route UI
```

推荐首页状态：

- `NoInstallation`
- `Installing`
- `InstalledHome`
- `Recovery`
- `ChooseInstallation`

其中 `InstalledHome` 是长期入口，负责：

- 启动 OpenClaw
- 打开控制面板
- 修改 Provider / 权限 / 插件
- 查看 Skills 和工作区状态

安装成功页只作为一次性反馈，不应继续承担长期入口职责。

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

但 OpenClaw Agent 权限必须由 openclaw.json 的新版策略约束：

- `tools.profile` / `tools.allow` / `tools.deny`
- `tools.fs.workspaceOnly`
- `tools.exec.security` / `tools.exec.ask`
- `agents.defaults.sandbox.mode`
- `agents.defaults.skills` 与 `skills.*`

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
