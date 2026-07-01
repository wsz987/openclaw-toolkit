# Desktop Installer Hook Name 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将前端安装器 hook 的主命名从 `useStage1Installer` 迁移为 `useOpenClawInstaller`，同时保留旧导出兼容。

**架构：** `use-stage1-installer.ts` 文件路径暂不变；文件内实现函数改为 `useOpenClawInstaller`，旧 `useStage1Installer` 作为别名导出；组件和入口改用新 hook/controller 类型。

**技术栈：** React hooks、TypeScript、Vitest。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/hooks/use-stage1-installer.ts`
  - 职责：主 hook 和 controller 类型命名迁移。
- 修改：`apps/desktop/src/features/stage1/stage1-installer-app.tsx`
  - 职责：入口组件调用新 hook 名。
- 修改：
  - `apps/desktop/src/features/stage1/components/installer-workflow-screen.tsx`
  - `apps/desktop/src/features/stage1/components/installer-workflow-view.tsx`
  - `apps/desktop/src/features/stage1/components/post-install-home-screen.tsx`
  - 职责：组件 props 类型改用 `OpenClawInstallerController`。

## 任务 1：hook 主导出迁移

- [ ] **步骤 1：改主函数名**

将：

```ts
export function useStage1Installer(...)
```

改为：

```ts
export function useOpenClawInstaller(...)
```

- [ ] **步骤 2：保留旧别名**

在文件尾部导出：

```ts
export const useStage1Installer = useOpenClawInstaller;
export type OpenClawInstallerController = ReturnType<typeof useOpenClawInstaller>;
export type Stage1InstallerController = OpenClawInstallerController;
```

## 任务 2：入口和组件使用新名

- [ ] **步骤 1：入口调用新 hook**

`stage1-installer-app.tsx` 改为导入并调用 `useOpenClawInstaller`。

- [ ] **步骤 2：组件类型使用新 controller 名**

三个组件从 hook 文件导入 `OpenClawInstallerController`。

## 任务 3：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `use-stage1-installer.ts` 文件。
- 本轮不重命名 `Stage1InstallerApp` 组件。
- 旧 hook 和旧 controller 类型继续可用。
