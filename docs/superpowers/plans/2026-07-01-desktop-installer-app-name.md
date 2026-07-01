# Desktop Installer App Name 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将安装器入口组件主名从 `Stage1InstallerApp` 迁移为 `OpenClawInstallerApp`，继续保留旧组件名兼容。

**架构：** `stage1-installer-app.tsx` 文件路径暂不变；组件实现改用 `OpenClawInstallerApp`，旧 `Stage1InstallerApp` 作为别名导出；`app-bootstrap.tsx` 改用新名。

**技术栈：** React、TypeScript、Vitest。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/stage1-installer-app.tsx`
  - 职责：入口组件主名迁移。
- 修改：`apps/desktop/src/app-bootstrap.tsx`
  - 职责：应用启动入口改用新组件名。

## 任务 1：组件主名迁移

- [ ] **步骤 1：改 props 类型和组件名**

将：

```ts
type Stage1InstallerAppProps = ...
export function Stage1InstallerApp(...)
```

改为：

```ts
type OpenClawInstallerAppProps = ...
export function OpenClawInstallerApp(...)
```

- [ ] **步骤 2：保留旧别名**

在文件尾部导出：

```ts
export const Stage1InstallerApp = OpenClawInstallerApp;
```

## 任务 2：app-bootstrap 改用新名

- [ ] **步骤 1：替换 import 和 JSX**

`app-bootstrap.tsx` 从 `Stage1InstallerApp` 改为 `OpenClawInstallerApp`。

## 任务 3：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `stage1-installer-app.tsx` 文件。
- 本轮不重命名 `features/stage1` 目录。
- 旧 `Stage1InstallerApp` 继续可导入。
