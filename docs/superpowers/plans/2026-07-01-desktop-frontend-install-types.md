# Desktop Frontend Install Types 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在前端 API/模型层引入 neutral 的安装类型命名，减少 `Stage1*` 作为产品语义继续扩散。

**架构：** `model/types.ts` 新增 `Install*` / `OpenClawInstall*` 主类型，并把旧 `Stage1*` 保留为兼容别名；`stage1-api.ts` 内部改用 neutral 类型，但导出的函数名暂不重命名，避免影响组件层。

**技术栈：** TypeScript、Vitest、Tauri invoke API。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/model/types.ts`
  - 职责：新增 neutral 主类型，旧 `Stage1*` 变为别名。
- 修改：`apps/desktop/src/features/stage1/api/stage1-api.ts`
  - 职责：API 层内部使用 neutral 类型命名。
- 修改：`apps/desktop/tests/stage1-api-command-names.test.ts`
  - 职责：保持 API command 名测试通过，必要时增加类型导入 smoke test。

## 任务 1：新增 neutral 类型并保留兼容别名

- [ ] **步骤 1：在 `types.ts` 新增主类型**

将这些定义改为 neutral 主类型：

```ts
InstallPhase
InstallStepState
InstallCheckState
InstallEnvironmentCheck
InstallStepSnapshot
InstallDashboard
OpenClawInstallResult
OpenClawInstallPayload
InstallDiagnosticsInfo
InstallLogTail
```

- [ ] **步骤 2：追加旧类型别名**

在主类型之后保留：

```ts
export type Stage1Phase = InstallPhase;
export type Stage1StepState = InstallStepState;
export type Stage1CheckState = InstallCheckState;
export type Stage1EnvironmentCheck = InstallEnvironmentCheck;
export type Stage1StepSnapshot = InstallStepSnapshot;
export type Stage1Dashboard = InstallDashboard;
export type Stage1InstallResult = OpenClawInstallResult;
export type Stage1InstallPayload = OpenClawInstallPayload;
export type Stage1DiagnosticsInfo = InstallDiagnosticsInfo;
export type Stage1InstallLogTail = InstallLogTail;
```

## 任务 2：API 层使用 neutral 类型

- [ ] **步骤 1：修改 `stage1-api.ts` 导入**

把内部使用的 `Stage1*` 类型替换为 neutral 类型，但导出函数名保持不变。

- [ ] **步骤 2：运行测试**

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `features/stage1` 目录。
- 本轮不重命名 React component 和 hook。
- 旧类型名继续可用，保证组件层不受影响。
