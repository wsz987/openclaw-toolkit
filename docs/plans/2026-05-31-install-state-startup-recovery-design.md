# OpenClaw Toolkit 安装状态持久化与启动恢复设计

## 1. 背景

当前 Stage 1 已完成基础安装、配置写入、技能安装、运行校验和安装后操作入口，但“安装完成后的长期状态管理”仍不完整。

现象上主要表现为：

- 用户把 OpenClaw 安装到非默认目录后，下次打开应用无法自动识别
- 前端默认仍以 `D:\OpenClaw` 作为推断入口，导致真实安装结果丢失
- 安装完成后的“启动 OpenClaw / 打开面板 / 修改配置 / 安装插件”等交互依赖本次会话内存态，应用重启后无法自然恢复
- 当前“已安装判断”依赖 `baseDir + selectedVersion + installMode` 的即时组合推导，不是稳定的安装记录

这不是单一字段缺失，而是缺少“应用级安装实例注册中心”。

## 2. 当前设计缺口

结合当前文档与实现，问题根因有 5 个：

### 2.1 安装记录只存在于安装目录内部

当前 `installed-manifest.json` 写在 `openclaw/<version>/installed-manifest.json` 内部。它能证明“这个目录曾被安装过”，但不能解决“应用下次启动时先去哪里找”的问题。

### 2.2 缺少应用级持久化索引

应用启动时没有全局 registry 来记录：

- 最近一次成功安装的实例
- 当前激活实例
- 用户上次选择的安装根目录
- 多个安装实例的列表
- 失败中的安装、待恢复安装、失效安装

因此只能退化成“按默认目录猜”。

### 2.3 启动入口和安装入口耦合

当前安装后成功页依赖本次会话中的 `result.configPath`、`result.openclawDir` 等内存态。应用重启后，这些状态不会恢复，所以“安装后能力页”无法再次进入。

### 2.4 已安装判断依赖即时参数而非稳定实例

当前 dashboard 检测逻辑本质上是：

- 先用 `baseDir`
- 再用 `installMode`
- 再用 `selectedVersion`
- 推导目标目录
- 然后查这个目录下有没有 `installed-manifest.json`

这会带来两个问题：

- 用户改过安装目录时会误判未安装
- `selectedVersion=latest` 在远程版本变化后会漂移，导致旧安装被误判

### 2.5 “安装存在”与“运行可用”没有分层

当前状态混在一起，缺少分层定义：

- 是否存在有效安装
- 配置是否完整
- Provider/插件是否已初始化
- 运行时是否已启动
- 控制面板是否可访问

结果是 UI 很难稳定决定应该展示哪一屏。

## 3. 目标

新设计需要保证：

1. 用户安装到任何自定义目录，应用重启后都能稳定识别。
2. 应用启动时先恢复“已安装实例”，再决定显示安装向导、恢复页还是操作首页。
3. 安装完成后的启动、打开面板、修改配置、插件管理，必须成为“安装实例生命周期”的一部分，而不是一次性成功页。
4. 支持未来一个设备上存在多个 OpenClaw 安装实例。
5. 保留当前 `installed-manifest` 作为实例内证明，同时增加应用级 registry。

## 4. 推荐总体方案

推荐采用“三层持久化 + 一次启动引导”的架构。

```text
App Settings
  └─ 记录用户偏好与当前激活实例

Installation Registry
  └─ 记录所有已知安装实例及其状态

Instance Manifest
  └─ 记录某个具体安装目录自身的安装事实与版本信息
```

### 4.1 三层职责

#### A. App Settings

建议存放到 Tauri 的 `app_local_data_dir` 或 `app_config_dir`，不要放在 OpenClaw 安装目录里。

职责：

- `lastSelectedBaseDir`
- `activeInstallationId`
- `recentInstallationIds`
- UI 偏好项

这是“用户偏好层”，不是安装事实层。

#### B. Installation Registry

这是本次缺失的核心能力，也应存放在 Tauri 应用数据目录。

职责：

- 保存所有安装实例索引
- 记录当前激活实例
- 记录实例的最新验证结果
- 作为应用启动时的第一发现入口

#### C. Instance Manifest

继续保留在实际安装目录内，作为“安装目录自身自描述文件”。

职责：

- 证明这个目录确实装过 OpenClaw
- 记录版本、路径、安装方式、配置文件路径
- 用于 registry 丢失后的再发现和导入

## 5. 数据模型设计

## 5.1 App Settings

建议文件：`%LOCALAPPDATA%\\OpenClawToolkit\\settings.json`

```json
{
  "schemaVersion": 1,
  "lastSelectedBaseDir": "E:\\AI\\OpenClaw",
  "activeInstallationId": "inst_01jxyz...",
  "recentInstallationIds": ["inst_01jxyz..."]
}
```

## 5.2 Installation Registry

建议文件：`%LOCALAPPDATA%\\OpenClawToolkit\\install-registry.json`

```json
{
  "schemaVersion": 1,
  "activeInstallationId": "inst_01jxyz...",
  "installations": [
    {
      "installationId": "inst_01jxyz...",
      "displayName": "OpenClaw 主环境",
      "baseDir": "E:\\AI\\OpenClaw",
      "openclawDir": "E:\\AI\\OpenClaw\\openclaw\\1.2.1",
      "nodeDir": "E:\\AI\\OpenClaw\\runtimes\\node\\20.11.1-win-x64",
      "configPath": "E:\\AI\\OpenClaw\\openclaw\\1.2.1\\openclaw.json",
      "installedManifestPath": "E:\\AI\\OpenClaw\\openclaw\\1.2.1\\installed-manifest.json",
      "installMode": "local",
      "openclawVersion": "1.2.1",
      "nodeVersion": "20.11.1",
      "status": "installed",
      "configState": "ready",
      "runtimeState": "stopped",
      "providerState": "partial",
      "panelState": "unknown",
      "installedAt": "2026-05-31T03:12:00Z",
      "lastValidatedAt": "2026-05-31T03:15:00Z",
      "lastLaunchedAt": null,
      "lastError": null
    }
  ]
}
```

建议状态拆分：

- `status`: `installing | installed | degraded | missing | failed | removed`
- `configState`: `missing | partial | ready`
- `runtimeState`: `stopped | starting | running | unreachable`
- `providerState`: `uninitialized | partial | ready`
- `panelState`: `unknown | available | unavailable`

不要用单个 `installed: true/false` 代替。

## 5.3 Instance Manifest

当前结构已经有基础，建议扩展为：

```json
{
  "schemaVersion": 1,
  "installationId": "inst_01jxyz...",
  "toolkitVersion": "0.1.0",
  "openclawVersion": "1.2.1",
  "nodeVersion": "20.11.1",
  "installMode": "local",
  "installedAt": "2026-05-31T03:12:00Z",
  "baseDir": "E:\\AI\\OpenClaw",
  "openclawDir": "E:\\AI\\OpenClaw\\openclaw\\1.2.1",
  "nodeDir": "E:\\AI\\OpenClaw\\runtimes\\node\\20.11.1-win-x64",
  "configPath": "E:\\AI\\OpenClaw\\openclaw\\1.2.1\\openclaw.json",
  "skills": [
    { "name": "feishu-plugin", "version": "1.0.0" }
  ]
}
```

关键补充是：

- `schemaVersion`
- `installationId`
- `baseDir`

这样 registry 和 instance manifest 才能双向校验。

## 5.4 Workflow State

当前 `stage1-status.json` 放在 `baseDir\\logs`，建议保留日志侧写法，但新增应用级 workflow 状态文件：

`%LOCALAPPDATA%\\OpenClawToolkit\\workflows\\<installationId>.json`

职责：

- 支持应用重启后恢复“安装中/失败待修复/待继续”
- 不依赖用户必须再次输入同一个目录

## 6. 启动恢复设计

应用启动时不要直接进入 Stage 1 安装向导，而是统一走 `bootstrap_app_state()`。

### 6.1 启动引导流程

```text
App Start
  -> load settings
  -> load install registry
  -> locate active installation
  -> validate installation paths
  -> validate installed-manifest consistency
  -> validate config
  -> probe runtime status
  -> probe control panel reachability
  -> produce AppBootstrapState
  -> route UI
```

### 6.2 UI 路由规则

建议把首页路由改为以下几类：

1. `NoInstallation`
说明：没有任何已知实例
动作：进入安装向导

2. `Installing`
说明：存在未完成 workflow
动作：展示继续安装 / 回滚 / 重新开始

3. `InstalledHome`
说明：存在有效安装实例
动作：展示启动、打开面板、修改配置、插件管理、技能管理

4. `Recovery`
说明：registry 有记录，但路径缺失或配置损坏
动作：展示重新定位目录、修复配置、重新验证

5. `ChooseInstallation`
说明：存在多个实例且当前没有明确 active
动作：选择激活实例

这一步是解决“下次打开软件界面不合理、交互一直没有显示”的关键。

## 7. 安装流程重构建议

当前流程本身不需要推翻，但要在关键节点补 registry 写入。

### 7.1 安装前

- 根据 `baseDir + version` 创建或复用 `installationId`
- 在 registry 中写入一条 `status=installing`
- 记录 workflow 文件

### 7.2 安装中

每完成一个 step：

- 更新 workflow 状态
- 同步更新 registry 中的 `openclawVersion/nodeVersion/currentStep/lastError`

### 7.3 安装成功后

顺序建议改成：

```text
installOpenClaw
  -> writeInstalledManifest
  -> registerInstallation
  -> generateOpenClawConfig
  -> installSkills
  -> configurePermissions
  -> configureBrowser
  -> verifyRuntime
  -> markInstallationInstalled
  -> setActiveInstallation
```

注意：

- `registerInstallation` 不能等到最后才做
- `setActiveInstallation` 应在成功后执行
- `verifyRuntime` 失败时应把实例标记为 `degraded` 或 `failed`，而不是简单丢失

### 7.4 安装失败后

写入：

- `status=failed`
- `lastError`
- `failedStep`
- `updatedAt`

这样下次启动可以直接给用户“继续修复”而不是重新猜路径。

## 8. 安装后操作首页设计

安装完成后，不应停留在“一次性成功页”概念，而应进入“实例操作首页”。

建议首页分成 4 块：

### 8.1 实例总览

- OpenClaw 版本
- Node 版本
- 安装目录
- 配置文件路径
- 最近校验时间
- 当前状态

### 8.2 运行控制

- 启动 OpenClaw
- 停止 OpenClaw
- 重启 OpenClaw
- 打开控制面板
- 查看日志

### 8.3 配置管理

- 初始化/修改 Provider
- 修改默认模型
- 修改 Agent 工具策略
- 导出/备份配置

### 8.4 插件与技能

- 查看已安装 Skills
- 安装/卸载插件
- 飞书插件启停

这部分应该由“active installation + validation result”驱动，而不是本次安装的 `result` 驱动。

## 9. 推荐 Rust 分层

为避免后续逻辑继续散在 workflow 和 UI 里，建议新增以下服务：

### 9.1 `InstallationRegistryRepository`

职责：

- 读写 registry
- 设置 active installation
- upsert installation entry

### 9.2 `InstallationDiscoveryService`

职责：

- 从 registry 发现实例
- 从 instance manifest 导入实例
- 做路径重定位

### 9.3 `InstallationValidationService`

职责：

- 校验目录、manifest、config、runtime、panel
- 输出统一 `InstallationHealthReport`

### 9.4 `AppBootstrapService`

职责：

- 启动时聚合 settings + registry + validation
- 生成前端首页需要的 bootstrap DTO

### 9.5 `InstallationLifecycleService`

职责：

- 安装
- 重装
- 修复
- 启动
- 停止
- 升级

推荐模式：

- Repository 负责存储
- Service 负责业务
- Workflow 只负责安装步骤编排
- UI 只负责状态展示与用户动作

## 10. 推荐前端模型

前端不要再以“安装成功页是否还在内存里”决定界面，而应统一成：

```text
BootstrapState
  -> AppViewModel
  -> Screen Router
```

建议模型：

```ts
type AppScreen =
  | 'bootstrap'
  | 'no-installation'
  | 'installing'
  | 'installed-home'
  | 'recovery'
  | 'choose-installation';
```

`Stage1InstallerApp` 不应同时承担：

- 应用启动入口
- 安装向导
- 安装后首页

建议拆为：

- `AppBootstrapShell`
- `InstallationWizard`
- `InstallationHome`
- `InstallationRecoveryView`

## 11. 推荐命令接口

建议新增 Tauri commands：

- `bootstrap_app_state()`
- `list_installations()`
- `set_active_installation(installationId)`
- `validate_installation(installationId)`
- `discover_installation_by_path(baseDir)`
- `resume_installation(installationId)`
- `repair_installation(installationId)`
- `open_control_panel(installationId)`

现有命令：

- `inspect_openclaw_status(configPath)`
- `launch_openclaw_runtime(configPath)`

建议逐步改成以 `installationId` 为主键，而不是以裸 `configPath` 为入口。

这样可以避免前端在重启后拿不到 `configPath`。

## 12. 兼容与迁移策略

为了兼容当前已安装用户，建议做一次平滑迁移。

### 12.1 第一次升级启动时

如果 registry 不存在：

- 读取 settings
- 尝试从 `lastSelectedBaseDir`
- 再尝试默认目录
- 再尝试扫描常见安装目录
- 读取其中的 `installed-manifest.json`
- 成功则自动导入 registry

### 12.2 导入规则

如果导入到旧格式 manifest：

- 补生成 `installationId`
- 回写 manifest
- 写入 registry

### 12.3 回退策略

若 registry 损坏但实例目录还在：

- 允许用户“选择已有安装目录”
- 重新导入实例

## 13. 最佳落地顺序

建议分 4 个里程碑推进：

### Milestone A: 安装状态持久化

- 新增 settings/registry/workflow state
- 安装成功后写 registry
- 启动时读取 lastSelectedBaseDir

### Milestone B: 启动恢复

- 新增 `bootstrap_app_state`
- 应用启动自动进入安装首页或恢复页

### Milestone C: 安装后首页

- 把当前成功页升级为 `InstallationHome`
- 启动/打开面板/配置修改都基于 active installation

### Milestone D: 修复与多实例

- 支持损坏实例修复
- 支持多实例切换

## 14. 核心 ADR

### ADR-001：必须引入应用级安装注册中心

决策：采用 registry，而不是继续仅依赖默认目录推断。

原因：

- 目录可变
- 版本可变
- 需要支持多实例
- 启动恢复不能依赖表单输入

### ADR-002：安装存在与运行可用必须分层

决策：拆分 `status/configState/runtimeState/providerState/panelState`。

原因：

- 安装存在不代表运行中
- 配置缺失不代表需要重装
- UI 需要根据不同故障给出不同操作

### ADR-003：安装后入口必须从“成功页”升级为“实例首页”

决策：成功页仅作为安装结束反馈，不再承担长期入口职责。

原因：

- 应用重启后成功页无法恢复
- 真正稳定的入口应该是 active installation home

## 15. 结论

这次问题的本质不是“默认目录不对”，而是：

```text
当前系统只有安装流程，没有安装实例生命周期管理。
```

最佳设计不是继续补一个“记住上次目录”的小字段，而是补齐：

- 应用级 settings
- 安装实例 registry
- 启动 bootstrap
- 安装后实例首页
- 分层健康状态模型

只有这样，用户安装到任意目录后，应用下次启动才能稳定恢复状态，并自然进入：

- 启动 OpenClaw
- 打开控制面板
- 修改配置
- 安装插件/Skills

这些真正面向长期使用的界面化交互。
