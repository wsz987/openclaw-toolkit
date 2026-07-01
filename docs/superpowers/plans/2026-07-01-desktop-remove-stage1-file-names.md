# Desktop Remove Stage1 File Names 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从 desktop 前端模块中移除 `stage1-*` 文件名和 `Stage1*` 组件/API/hook 兼容导出。

**架构：** 本轮执行硬改名，不保留旧别名。为了控制范围，暂时保留 `features/stage1` 目录作为迁移容器；文件名、组件名、hook/API 函数名和测试名改为 installer/openclaw installer 命名。Rust Tauri 旧 command 兼容层不在本轮删除。

**技术栈：** TypeScript、React、Vitest。

---

## 文件结构

- 创建：`apps/desktop/tests/no-stage1-frontend-names.test.ts`
  - 职责：约束 desktop 前端不再新增 `stage1-*` 文件名和 `Stage1*` 标识符。
- 删除/重命名：
  - `components/stage1-header.tsx` -> `components/installer-header.tsx`
  - `components/stage1-shell.tsx` -> `components/installer-shell.tsx`
  - `components/stage1-stepper.tsx` -> `components/installer-stepper.tsx`
  - `components/stage1-views.tsx` -> `components/installer-views.tsx`
  - `api/stage1-api.ts` -> `api/installer-api.ts`
  - `hooks/use-stage1-installer.ts` -> `hooks/use-openclaw-installer.ts`
  - `stage1-installer-app.tsx` -> `openclaw-installer-app.tsx`
  - `tests/stage1-api-command-names.test.ts` -> `tests/installer-api-command-names.test.ts`
- 修改：所有引用上述文件或导出符号的 desktop 前端文件。

## 任务 1：红灯测试

- [ ] **步骤 1：新增扫描测试**

测试检查：
- `src/features/stage1` 下除了目录名外，文件 basename 不允许包含 `stage1`。
- `src/features/stage1` 和 `tests` 中不允许出现独立 `Stage1[A-Za-z0-9_]*` 标识符。
- 允许文档计划文件保留迁移说明，不纳入本测试。

- [ ] **步骤 2：运行测试验证失败**

运行：`rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- no-stage1-frontend-names"`

预期：FAIL，列出旧文件名和 `Stage1*` 标识符。

## 任务 2：文件硬改名

- [ ] **步骤 1：使用 `Move-Item` 重命名文件**

重命名上述 8 个源码/测试文件。若目标文件已存在，停止并检查，不覆盖。

- [ ] **步骤 2：更新 import 路径**

将所有 `stage1-api`、`use-stage1-installer`、`stage1-views`、`stage1-header`、`stage1-shell`、`stage1-stepper`、`stage1-installer-app` 引用替换成新文件名。

## 任务 3：导出符号硬改名

- [ ] **步骤 1：组件符号**

`Stage1Header` -> `InstallerHeader`
`Stage1Shell` -> `InstallerShell`
`Stage1ShellProps` -> `InstallerShellProps`
`Stage1Stepper` -> `InstallerStepper`

- [ ] **步骤 2：API/hook 符号**

`inspectStage1Dashboard` -> `inspectInstallDashboard`
`startStage1Install` -> `startOpenClawInstall`
`readStage1InstallLogTail` -> `readInstallLogTail`
`useStage1Installer` 旧别名删除
`Stage1InstallerController` 旧别名删除
`Stage1InstallerApp` 旧别名删除

- [ ] **步骤 3：类型兼容别名**

删除 `model/types.ts`、`model/app-flow.ts`、`model/debug-flow.ts` 中的 `Stage1*` 兼容类型和函数别名。本轮保留 localStorage key `stage1-debug-flow`，它是持久化兼容数据，不是代码结构命名。

## 任务 4：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 不保留新增旧别名。
- 不修改 UI 文案和业务流程。
- 本轮不移动 `features/stage1` 目录。
- 本轮不删除 Rust Tauri 旧 command wrapper。
