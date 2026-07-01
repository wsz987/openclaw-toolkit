# Desktop Selector View Types 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 selector 和 install workflow view 层从 `Stage1*` 类型引用迁移到 neutral `Install*` 类型引用。

**架构：** `model/types.ts` 已提供 neutral 主类型和旧兼容别名；本轮只替换 `selectors.ts` 与 `stage1-views.tsx` 的类型引用，不改变运行逻辑。

**技术栈：** TypeScript、React、Vitest。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/model/selectors.ts`
  - 职责：安装 dashboard 派生 selector。
- 修改：`apps/desktop/src/features/stage1/components/stage1-views.tsx`
  - 职责：安装 workflow 视图组件。

## 任务 1：selectors 类型迁移

- [ ] **步骤 1：替换导入类型**

`Stage1Dashboard` -> `InstallDashboard`
`Stage1EnvironmentCheck` -> `InstallEnvironmentCheck`
`Stage1StepSnapshot` -> `InstallStepSnapshot`
`Stage1Phase` -> `InstallPhase`
`Stage1CheckState` -> `InstallCheckState`
`Stage1DiagnosticsInfo` -> `InstallDiagnosticsInfo`

- [ ] **步骤 2：替换函数签名**

所有 selector 函数签名使用 neutral 类型。

## 任务 2：stage1-views 类型迁移

- [ ] **步骤 1：替换导入类型**

`Stage1Dashboard` -> `InstallDashboard`
`Stage1DiagnosticsInfo` -> `InstallDiagnosticsInfo`
`Stage1EnvironmentCheck` -> `InstallEnvironmentCheck`
`Stage1InstallLogTail` -> `InstallLogTail`
`Stage1StepSnapshot` -> `InstallStepSnapshot`

- [ ] **步骤 2：替换 props 类型**

只替换 TypeScript 类型注解，不修改 JSX 结构。

## 任务 3：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `stage1-views.tsx` 文件。
- 本轮不修改 UI 文案或 JSX。
- 旧 `Stage1*` 类型继续通过别名可用。
