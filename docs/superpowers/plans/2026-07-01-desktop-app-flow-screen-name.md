# Desktop App Flow Screen Name 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 app-flow 中的 `Stage1Screen` / `resolveStage1Screen` 迁移为 neutral 的 `InstallerScreen` / `resolveInstallerScreen`，保留旧导出兼容。

**架构：** `model/app-flow.ts` 以 neutral 命名作为主实现，旧 `Stage1*` 导出作为别名；`stage1-installer-app.tsx` 改用新 API。

**技术栈：** TypeScript、Vitest。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/model/app-flow.ts`
  - 职责：安装器 screen 类型和 flow selector。
- 修改：`apps/desktop/src/features/stage1/stage1-installer-app.tsx`
  - 职责：入口组件改用新 app-flow API。
- 创建：`apps/desktop/tests/app-flow-screen-name.test.ts`
  - 职责：锁定新 API 可导入且行为不变。

## 任务 1：测试新 app-flow API

- [ ] **步骤 1：创建失败测试**

创建 `apps/desktop/tests/app-flow-screen-name.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  isInstallerWorkflowScreen,
  isPostInstallScreen,
  resolveInstallerScreen,
  type InstallerScreen
} from '../src/features/stage1/model/app-flow';

describe('installer app flow screen names', () => {
  it('exports neutral installer screen APIs', () => {
    const screen: InstallerScreen = resolveInstallerScreen({
      bootstrapState: null,
      hasError: false,
      hasInstallResult: false,
      phase: 'precheck',
      showPostInstallHome: false,
      wizardStep: 1
    });

    expect(screen).toBe('config');
    expect(isInstallerWorkflowScreen(screen)).toBe(true);
    expect(isPostInstallScreen(screen)).toBe(false);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- app-flow-screen-name.test.ts"
```

预期：FAIL，因为 `resolveInstallerScreen` / `InstallerScreen` 尚未导出。

## 任务 2：app-flow 主命名迁移

- [ ] **步骤 1：新增 neutral 类型**

将 `Stage1Screen` 主定义改为 `InstallerScreen`，`ResolveStage1ScreenInput` 改为导出的 `ResolveInstallerScreenInput`。

- [ ] **步骤 2：新增 neutral 函数**

将实现函数改为：

```ts
export function resolveInstallerScreen(input: ResolveInstallerScreenInput): InstallerScreen
```

- [ ] **步骤 3：保留旧别名**

导出：

```ts
export type Stage1Screen = InstallerScreen;
export type ResolveStage1ScreenInput = ResolveInstallerScreenInput;
export const resolveStage1Screen = resolveInstallerScreen;
```

## 任务 3：入口组件改用新 API

- [ ] **步骤 1：替换导入和调用**

`stage1-installer-app.tsx` 从 `resolveStage1Screen` 改为 `resolveInstallerScreen`。

## 任务 4：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `app-flow.ts` 文件。
- 本轮不重命名 `InstallerWorkflowScreen` 组件。
- 旧 `Stage1Screen` / `resolveStage1Screen` 继续可用。
