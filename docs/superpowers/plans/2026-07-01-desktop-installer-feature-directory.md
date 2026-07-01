# Desktop Installer Feature Directory 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 desktop 前端功能目录从 `features/stage1` 硬迁移到 `features/installer`，并移除源码中的 `stage1-debug-flow` key。

**架构：** `features/installer` 成为安装器功能模块唯一入口；不保留 `features/stage1` 兼容目录。本轮只改前端目录路径和本地 debug key，不修改 Rust command 注册。

**技术栈：** TypeScript、React、Vitest。

---

## 文件结构

- 创建：`apps/desktop/tests/no-stage1-feature-directory.test.ts`
  - 职责：扫描 desktop 源码和测试，禁止 `features/stage1` 路径与 `stage1-debug-flow` key。
- 移动：`apps/desktop/src/features/stage1` -> `apps/desktop/src/features/installer`
- 修改：`apps/desktop/src/app-bootstrap.tsx`
- 修改：`apps/desktop/tests/*.test.ts`
- 修改：`apps/desktop/src/features/installer/model/debug-flow.ts`
- 修改：`apps/desktop/tests/no-legacy-installer-names.test.ts`

## 任务 1：红灯测试

- [ ] **步骤 1：新增扫描测试**

扫描 `apps/desktop/src` 和 `apps/desktop/tests` 下所有 `.ts/.tsx` 文件：
- 不允许出现 `features/stage1`
- 不允许出现 `features\\stage1`
- 不允许出现 `stage1-debug-flow`

- [ ] **步骤 2：运行测试验证失败**

运行：`rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- no-stage1-feature-directory"`

预期：FAIL，列出 `app-bootstrap.tsx`、相关测试和 `debug-flow.ts`。

## 任务 2：移动目录

- [ ] **步骤 1：检查目标目录不存在**

运行：`rtk proxy powershell -NoProfile -Command "Test-Path 'apps/desktop/src/features/installer'"`

预期：`False`

- [ ] **步骤 2：移动目录**

运行：`rtk proxy powershell -NoProfile -Command "Move-Item -LiteralPath 'apps/desktop/src/features/stage1' -Destination 'apps/desktop/src/features/installer'"`

## 任务 3：更新路径和 key

- [ ] **步骤 1：更新 import 路径**

将 `features/stage1` 替换为 `features/installer`。

- [ ] **步骤 2：更新 debug storage key**

`stage1-debug-flow` -> `installer-debug-flow`。

- [ ] **步骤 3：更新 no-legacy 测试扫描根目录**

`src/features/stage1` -> `src/features/installer`。

## 任务 4：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 不保留 `features/stage1` 目录。
- 不保留 `stage1-debug-flow` key。
- 不修改 UI 文案和业务逻辑。
