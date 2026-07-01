# Desktop Debug Flow Name 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 debug flow API 从 `Stage1DebugFlowState` / `readStage1DebugFlowState` / `writeStage1DebugFlowState` 迁移到 `InstallerDebugFlowState` / `readInstallerDebugFlowState` / `writeInstallerDebugFlowState`。

**架构：** `debug-flow.ts` 使用 neutral 名作为主实现，旧 `Stage1*` API 作为兼容别名；localStorage key 暂不改，避免影响现有开发态状态。

**技术栈：** TypeScript、Vitest、React。

---

## 文件结构

- 修改：`apps/desktop/src/features/stage1/model/debug-flow.ts`
  - 职责：debug bootstrap 状态读写。
- 修改：`apps/desktop/src/app-bootstrap.tsx`
  - 职责：应用启动入口使用新 debug-flow API。
- 创建：`apps/desktop/tests/debug-flow-name.test.ts`
  - 职责：锁定新 API 可导入且读写行为不变。

## 任务 1：测试新 debug-flow API

- [ ] **步骤 1：创建失败测试**

创建 `apps/desktop/tests/debug-flow-name.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import {
  readInstallerDebugFlowState,
  writeInstallerDebugFlowState,
  type InstallerDebugFlowState
} from '../src/features/stage1/model/debug-flow';

describe('installer debug flow names', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports neutral debug flow APIs', () => {
    const state: InstallerDebugFlowState = { mode: 'installer', installerStep: 2 };

    writeInstallerDebugFlowState(state);

    expect(readInstallerDebugFlowState()).toEqual(state);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- debug-flow-name.test.ts"
```

预期：FAIL，因为新函数尚未导出。

## 任务 2：debug-flow 主命名迁移

- [ ] **步骤 1：新增 neutral 类型和函数**

`Stage1DebugFlowState` 改为 `InstallerDebugFlowState` 主类型；`readStage1DebugFlowState` / `writeStage1DebugFlowState` 改为 `readInstallerDebugFlowState` / `writeInstallerDebugFlowState` 主函数。

- [ ] **步骤 2：保留旧别名**

导出：

```ts
export type Stage1DebugFlowState = InstallerDebugFlowState;
export const readStage1DebugFlowState = readInstallerDebugFlowState;
export const writeStage1DebugFlowState = writeInstallerDebugFlowState;
```

## 任务 3：app-bootstrap 使用新 API

- [ ] **步骤 1：替换导入和调用**

`app-bootstrap.tsx` 改为导入 `readInstallerDebugFlowState` 和 `writeInstallerDebugFlowState`。

## 任务 4：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不改 localStorage key `stage1-debug-flow`。
- 本轮不重命名 `debug-flow.ts` 文件。
- 旧 `Stage1*` API 继续可用。
