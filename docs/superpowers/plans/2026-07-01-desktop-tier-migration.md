# Desktop Tier Migration 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 desktop 接受服务端新签发的 `basic | pro | enterprise` 授权，并停止用 `features` gate 基础安装能力。

**架构：** 授权等级校验收敛在 `core/license` 模块；workflow 只负责验证授权有效性，不再理解基础能力 feature 字符串；旧 `Stage1*` 命名本轮不迁移。

**技术栈：** Rust/Tauri、serde、anyhow、Cargo tests、Markdown 文档。

---

## 文件结构

- 修改：`apps/desktop/src-tauri/src/core/license/mod.rs`
  - 职责：离线授权验签、激活码绑定、tier 与过期时间校验、未来高级 feature 校验。
- 修改：`apps/desktop/src-tauri/src/core/workflow/mod.rs`
  - 职责：安装流程编排；本轮只移除基础能力 feature gating 和更新 step 文案。
- 修改：`docs/desktop-update-mechanism.md`
  - 职责：修正旧 `stage-1` 授权示例。

## 任务 1：更新 license 行为

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/license/mod.rs`

- [ ] **步骤 1：编写失败测试**

在 `license/mod.rs` 测试模块中新增行为测试：

```rust
#[test]
fn accepts_basic_tier_with_no_features() {
    let mut license = base_license();
    license.tier = "basic".to_string();
    license.features = Vec::new();

    validate_license_payload(&license).unwrap();
}

#[test]
fn accepts_supported_commercial_tiers() {
    for tier in ["basic", "pro", "enterprise"] {
        let mut license = base_license();
        license.tier = tier.to_string();
        license.features = Vec::new();

        validate_license_payload(&license).unwrap();
    }
}

#[test]
fn rejects_unknown_tier() {
    let mut license = base_license();
    license.tier = "stage-3".to_string();

    assert!(validate_license_payload(&license).is_err());
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml license::tests::accepts_basic_tier_with_no_features -- --nocapture"
```

预期：FAIL，原因是 `basic` 当前不是有效 tier，或空 `features` 被拒绝。

- [ ] **步骤 3：实现最小代码**

在 `license/mod.rs` 中新增集中校验函数：

```rust
fn is_supported_license_tier(tier: &str) -> bool {
    matches!(tier, "basic" | "pro" | "enterprise")
}
```

将 `validate_license_payload` 的 tier 分支改为使用该函数，并删除 `features.is_empty()` 报错。

- [ ] **步骤 4：更新 dev/test fixture**

将开发授权和测试基础 fixture 的 tier 改为 `basic`。开发授权的基础 features 改为空数组。

- [ ] **步骤 5：运行 license 测试**

运行：

```bash
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml license::tests -- --nocapture"
```

预期：PASS。

## 任务 2：移除 workflow 基础 feature gating

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/workflow/mod.rs`

- [ ] **步骤 1：编写失败测试**

优先复用任务 1 的 license tests 验证基础授权可用；workflow 目前没有低成本单元测试夹具，本任务不新增大型集成 fixture，避免为了测试重构安装流程。

- [ ] **步骤 2：实现最小代码**

从 workflow import 中移除：

```rust
ensure_install_mode_allowed, ensure_license_feature
```

删除 `run_stage1_install` 中这两段检查：

```rust
ensure_license_feature(&license, "managed-node-runtime")
ensure_install_mode_allowed(&license, &install_mode)
```

保留：

```rust
verify_offline_license(input.license_key.as_deref(), &project_root)
```

- [ ] **步骤 3：更新 step 文案**

将：

```rust
"校验离线激活码、授权文件和功能范围"
```

改为：

```rust
"校验离线激活码、授权文件、授权等级和有效期"
```

- [ ] **步骤 4：运行 Rust 编译/测试**

运行：

```bash
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：PASS。

## 任务 3：更新旧文档示例

**文件：**
- 修改：`docs/desktop-update-mechanism.md`

- [ ] **步骤 1：替换旧示例**

将 `"tier": "stage-1"` 替换为 `"tier": "basic"`。

- [ ] **步骤 2：扫描残留**

运行：

```bash
rtk rg -n "\"tier\": \"stage-1\"|stage-1" docs/desktop-update-mechanism.md apps/desktop/src-tauri/src/core/license/mod.rs
```

预期：`license/mod.rs` 不再有旧 tier 作为有效签发值；文档不再出现旧授权示例。

## 自检

- 本计划覆盖 `docs/desktop-tier-migration-plan.md` 的第一、二、三步。
- 本轮不做 Tauri command 兼容迁移，不做 `features/stage1` 目录重命名。
- 本轮不新增套餐选择 UI。
