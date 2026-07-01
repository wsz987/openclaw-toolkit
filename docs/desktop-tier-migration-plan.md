# Desktop 授权等级改造方案

## 背景

服务端授权模型已经从旧的阶段概念调整为套餐等级：

```text
tier = basic | pro | enterprise
features = 额外授权能力
```

新的语义是：

- `basic` 是默认基础授权。
- `pro` 和 `enterprise` 是后续高级授权等级。
- 基础安装能力默认开放，不再写入 `features`，也不再作为授权 gating 条件。
- `features` 只记录额外能力，例如企业策略、审计、私有模型网关或高级 provider 管理。

desktop 目前仍有两类旧概念：

- 授权校验仍接受 `stage-1 | stage-2`。
- 前端和 Rust workflow 仍大量使用 `Stage1*` 命名、`stage1-status.json`、`start_stage1_install` 等接口。

本次 desktop 改造的核心不是在桌面端新增套餐购买逻辑，而是让客户端接受服务端签发的新授权 payload，并逐步去掉 `stage-1` 作为产品语义。

## 现状定位

### 服务端已完成的新模型

服务端和签发脚本已经使用：

```text
basic | pro | enterprise
```

相关文档也已经明确：

- `tier` 表示客户购买的授权等级。
- `features` 只表示额外授权能力。
- `offline-install`、`remote-artifact-install`、`official-npm-install`、`managed-node-runtime`、`local-skills`、`browser-control`、`feishu-plugin` 等基础能力默认开放。

### desktop 待改造点

Rust 授权模块：

```text
apps/desktop/src-tauri/src/core/license/mod.rs
```

当前问题：

- `validate_license_payload` 只接受 `stage-1 | stage-2`。
- `validate_license_payload` 要求 `features` 非空。
- `ensure_install_mode_allowed` 用 feature 控制 `local | remote | npm` 安装模式。
- `verify_dev_license` 返回 `tier: "stage-1"`。
- 测试数据仍使用 `stage-1`。

Rust 安装 workflow：

```text
apps/desktop/src-tauri/src/core/workflow/mod.rs
```

当前问题：

- `run_stage1_install` 在授权验证后继续检查 `managed-node-runtime` feature。
- `run_stage1_install` 继续调用 `ensure_install_mode_allowed`。
- 安装日志、状态文件、workflow id 仍叫 stage1。

Tauri command 和前端 API：

```text
apps/desktop/src-tauri/src/commands/workflow.rs
apps/desktop/src/features/stage1/api/stage1-api.ts
apps/desktop/src/features/stage1/model/types.ts
apps/desktop/src/features/stage1/hooks/use-stage1-installer.ts
apps/desktop/src/features/stage1/stage1-installer-app.tsx
```

当前问题：

- 命令名、类型名、目录名和组件名仍使用 `stage1`。
- 这些命名已经变成历史包袱，不再代表产品套餐或授权等级。

文档：

```text
docs/desktop-update-mechanism.md
docs/architecture-plan.md
docs/offline-license-production.md
```

当前问题：

- `architecture-plan` 和 `offline-license-production` 已经是新语义。
- `desktop-update-mechanism` 里仍有旧的 `"tier": "stage-1"` 示例。

## 推荐方案

推荐采用“两步走”：

1. 先改授权语义和 runtime 行为，保证新服务端签发的 `basic/pro/enterprise` 授权能被 desktop 正常使用。
2. 再做命名迁移，把 `stage1` 重命名为 neutral 的 `install`、`installer` 或 `workflow`。

不建议第一步就全量重命名前端目录和 Rust 类型。`stage1` 当前覆盖面很大，直接重命名会牵连 UI、hooks、channels、post-install、uninstall、tests 和 Tauri command，容易把“授权语义修正”和“大规模机械迁移”混在一起。

## 方案对比

### 方案 A：只改授权语义，保留 `stage1` 命名

做法：

- desktop 授权校验改为接受 `basic | pro | enterprise`。
- `features` 允许为空。
- 取消基础安装模式对 feature 的 gating。
- dev license 改为 `tier: "basic"`。
- 保留 `Stage1*` 类型、`features/stage1` 目录和 Tauri command 名。

优点：

- 改动最小。
- 能最快打通服务端新授权。
- 风险集中在 license/workflow。

缺点：

- 代码里仍有 stage1 历史命名。
- 后续维护会继续产生概念混淆。

适合作为第一阶段。

### 方案 B：授权语义 + 对外命令兼容迁移

做法：

- 完成方案 A。
- 新增 neutral command，例如 `inspect_install_dashboard_command`、`start_openclaw_install`、`read_install_log_tail_command`。
- 前端 API 改用新 command。
- 旧 command 保留一版，内部转调新函数，避免已有前端或测试立即断掉。
- Rust 内部函数逐步从 `run_stage1_install` 改为 `run_openclaw_install`。

优点：

- 授权语义和新命名开始对齐。
- 对外接口有兼容层，回滚和排查更容易。
- 后续可以逐步清理旧命名。

缺点：

- 比方案 A 多一层兼容代码。
- 仍不能一次性完全消除 `stage1`。

推荐作为主方案。

### 方案 C：一次性全量去掉 `stage1`

做法：

- `features/stage1` 目录重命名为 `features/installer`。
- 所有 `Stage1*` 类型改为 `Install*` 或 `OpenClawInstall*`。
- 所有 command、日志、状态文件、测试和文档同时重命名。

优点：

- 最干净。
- 新人理解成本最低。

缺点：

- 改动面非常大。
- 很容易引入纯重命名导致的导入路径、事件名、状态恢复兼容问题。
- 会影响已有安装状态文件 `logs/stage1-status.json` 的恢复逻辑。

不建议作为本轮第一步。

## 目标设计

### 授权 payload

desktop 应接受：

```json
{
  "licenseId": "lic-...",
  "customer": "Acme Corp",
  "tier": "basic",
  "expiresAt": "2027-12-31",
  "features": [],
  "activationHash": "sha256:...",
  "iat": 1780000000,
  "exp": 1800000000
}
```

校验规则：

- `licenseId` 必填。
- `customer` 必填。
- `tier` 必须是 `basic | pro | enterprise`。
- `features` 默认空数组，允许为空。
- `activationHash` 必须与短激活码匹配。
- `expiresAt` 或 `exp` 未过期。

兼容策略：

- 开发态可以短期接受旧的 `stage-1 | stage-2`，但生产逻辑应以新 tier 为准。
- 如果需要兼容已交付旧授权，可以将 `stage-1` 映射为 `basic`，`stage-2` 映射为 `pro` 或按业务定义映射。
- 如果确认没有旧客户授权需要兼容，可以直接拒绝旧 tier。

### 基础能力 gating

安装基础能力不再依赖 `features`：

```text
local install              默认允许
remote artifact install    默认允许
npm install                默认允许
managed node runtime       默认允许
local skills               默认允许
browser control            默认允许
feishu plugin              默认允许
```

应删除或停止调用：

```rust
ensure_license_feature(&license, "managed-node-runtime")
ensure_install_mode_allowed(&license, &install_mode)
```

`ensure_license_feature` 可以保留给未来高级能力，例如：

```text
advanced-provider-management
enterprise-audit
private-model-gateway
```

### desktop 不需要做套餐选择 UI

desktop 安装器只需要：

- 输入短激活码。
- 验证本地 `license.dat`。
- 显示授权客户、等级、过期时间。
- 根据 extra features 决定是否展示或启用高级功能。

不建议在 desktop 里让用户选择 `basic/pro/enterprise`。套餐等级来自服务端签发结果，客户端只验证和展示。

### 命名迁移目标

长期目标：

```text
Stage1InstallInput      -> OpenClawInstallInput
Stage1InstallResult     -> OpenClawInstallResult
Stage1Dashboard         -> InstallDashboard
Stage1Phase             -> InstallPhase
Stage1StepState         -> InstallStepState
Stage1CheckState        -> InstallCheckState
run_stage1_install      -> run_openclaw_install
inspect_stage1_dashboard -> inspect_install_dashboard
features/stage1         -> features/installer
stage1-api.ts           -> installer-api.ts
use-stage1-installer    -> use-openclaw-installer
stage1-status.json      -> install-status.json
```

兼容策略：

- 第一阶段继续读取 `stage1-status.json`。
- 新版本写入 `install-status.json`。
- 如果 `install-status.json` 不存在但 `stage1-status.json` 存在，则读取旧文件并迁移。
- 旧 Tauri command 至少保留一个版本，内部转调新 command。

## 实施步骤

### 第一步：修正 desktop 授权语义

修改：

```text
apps/desktop/src-tauri/src/core/license/mod.rs
```

要点：

- 新增 `LicenseTier` 或常量校验，接受 `basic | pro | enterprise`。
- `features` 保持 `#[serde(default)]`，允许为空。
- 删除 `features.is_empty()` 报错。
- `verify_dev_license` 返回 `tier: "basic"`，`features: []`。
- 测试 fixture 改为 `basic`。
- 新增测试覆盖：
  - `basic` + 空 features 通过。
  - `pro` 通过。
  - `enterprise` 通过。
  - 未知 tier 拒绝。
  - 缺失 features 时默认空数组。

### 第二步：移除基础安装 feature gating

修改：

```text
apps/desktop/src-tauri/src/core/workflow/mod.rs
```

要点：

- 保留 `verify_offline_license`。
- 删除 `managed-node-runtime` 检查。
- 删除安装模式 feature 检查。
- `validateLicense` step 的含义改成“校验授权文件、激活码、等级和过期时间”。
- step 文案从“校验离线激活码、授权文件和功能范围”改为“校验离线激活码、授权文件、授权等级和有效期”。

### 第三步：更新文档和示例

修改：

```text
docs/desktop-update-mechanism.md
```

要点：

- 示例里的 `"tier": "stage-1"` 改为 `"tier": "basic"`。
- 避免把 desktop update tier 与授权 tier 混用。如果 update 也需要分渠道，建议字段命名为 `channel`、`audience` 或 `rolloutGroup`，不要继续使用 `stage-1`。

### 第四步：增加兼容命令

修改：

```text
apps/desktop/src-tauri/src/core/workflow/mod.rs
apps/desktop/src-tauri/src/commands/workflow.rs
apps/desktop/src/features/stage1/api/stage1-api.ts
```

要点：

- Rust 内部新增 neutral 函数名。
- 旧 `stage1` command 保留，内部调用新函数。
- 前端 API 先改用新 command。
- 测试旧 command 兼容路径。

### 第五步：前端目录和类型重命名

修改范围较大，建议单独 PR：

```text
apps/desktop/src/features/stage1
apps/desktop/src/app-bootstrap.tsx
apps/desktop/tests/*
```

要点：

- `features/stage1` 改为 `features/installer`。
- `Stage1InstallerApp` 改为 `OpenClawInstallerApp`。
- `useStage1Installer` 改为 `useOpenClawInstaller`。
- `Stage1InstallResult` 等类型改为 neutral 命名。
- 保留用户可见文案的稳定性，不需要把所有 UI 文案重写。

## 测试清单

Rust license tests：

- `basic` 授权可通过。
- `features: []` 可通过。
- 缺失 `features` 字段可通过。
- `pro` 和 `enterprise` 可通过。
- `stage-1` 是否兼容，按业务决策写测试。
- 未知 tier 拒绝。
- 过期授权拒绝。
- 激活码不匹配拒绝。

Rust workflow tests 或手工验证：

- `basic` + 空 features 可以走完整安装流程。
- `local`、`remote`、`npm` 三种安装模式不再因为缺少 feature 被拒绝。
- 旧安装状态文件可以恢复或迁移。

前端 tests：

- 安装器输入 basic 授权后进入下一步。
- 授权错误文案仍能正确展示。
- 更新检查测试路径不受影响。

端到端手工验证：

- 使用 `pnpm license:issue-key -- --tier basic --expires-in 1y --install-license-file` 生成授权。
- desktop 输入生成的短激活码。
- local 模式安装成功。
- 安装完成后进入已安装首页。
- 启动 OpenClaw runtime。
- 重启 desktop 后能恢复安装状态。

## 决策点

需要明确两个业务决策：

1. 是否需要兼容旧的 `stage-1 | stage-2` 授权文件。
2. `stage-2` 如果兼容，应映射到 `pro` 还是 `enterprise`。

如果没有已交付旧授权，建议直接不兼容旧 tier，减少长期维护成本。

如果已有客户拿到旧授权，建议只做读取兼容，不再签发旧授权：

```text
stage-1 -> basic
stage-2 -> pro
```

## 推荐落地顺序

推荐按以下顺序执行：

1. 先改 `license/mod.rs`，打通 `basic/pro/enterprise`。
2. 再改 `workflow/mod.rs`，停止用 features gate 基础安装能力。
3. 更新旧文档示例。
4. 增加新 command 并保留旧 command 兼容。
5. 最后单独做 `stage1` 命名迁移。

这样能最快让 desktop 跟服务端新授权模型对齐，同时把大规模重命名的风险拆出去。
