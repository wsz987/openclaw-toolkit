# Desktop Workflow View Type Names 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将安装流程组件层残留的 `Stage1Dashboard`、`Stage1Phase`、`Stage1InstallLogTail` 类型引用迁移到 neutral `InstallDashboard`、`InstallPhase`、`InstallLogTail`。

**架构：** `model/types.ts` 保留 `Stage1*` 兼容别名；API 层保留旧函数名作为兼容入口。本轮只迁移组件类型引用，不修改函数名、文件名、UI 文案、状态流或 Tauri 命令。

**技术栈：** TypeScript、React、Vitest。

---

## 文件结构

- 创建：`apps/desktop/tests/workflow-view-type-names.test.ts`
  - 职责：扫描 stage1 feature 源码，约束 workflow view 组件不再使用旧 `Stage1*` 类型标识符。
- 修改：`apps/desktop/src/features/stage1/components/confirm-install-dialog.tsx`
  - 职责：安装确认弹窗，使用 `InstallDashboard` 的字段类型。
- 修改：`apps/desktop/src/features/stage1/components/runtime-operations-panel.tsx`
  - 职责：运行时操作面板，使用 `InstallLogTail`。
- 修改：`apps/desktop/src/features/stage1/components/stage1-stepper.tsx`
  - 职责：安装步骤条，使用 `InstallPhase`。

## 任务 1：红灯测试

- [ ] **步骤 1：新增扫描测试**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const deprecatedTypes = ['Stage1Dashboard', 'Stage1Phase', 'Stage1InstallLogTail'] as const;

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('workflow view type names', () => {
  it('keeps deprecated workflow view type names only as compatibility aliases', () => {
    const root = join(process.cwd(), 'src/features/stage1');
    const offenders = readSourceFiles(root)
      .flatMap((file) => {
        const rel = relative(root, file).replaceAll('\\', '/');
        if (rel === 'model/types.ts') {
          return [];
        }

        const text = readFileSync(file, 'utf8');
        return deprecatedTypes
          .filter((typeName) => new RegExp(`\\b${typeName}\\b`).test(text))
          .map((typeName) => `${rel}: ${typeName}`);
      });

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- workflow-view-type-names"`

预期：FAIL，列出 `confirm-install-dialog.tsx`、`runtime-operations-panel.tsx`、`stage1-stepper.tsx`。

## 任务 2：迁移组件类型引用

- [ ] **步骤 1：替换确认弹窗类型**

`confirm-install-dialog.tsx`：

```ts
import type { InstallDashboard } from '../model/types';
```

并将 `Stage1Dashboard[...]` 替换为 `InstallDashboard[...]`。

- [ ] **步骤 2：替换运行日志类型**

`runtime-operations-panel.tsx`：

```ts
import type {
  OpenClawPostInstallStatus,
  Stage1InstallLogTail,
  OpenClawInstallResult
} from '../model/types';
```

改为：

```ts
import type {
  OpenClawPostInstallStatus,
  InstallLogTail,
  OpenClawInstallResult
} from '../model/types';
```

并将 state 类型改为 `InstallLogTail | null`。

- [ ] **步骤 3：替换 stepper phase 类型**

`stage1-stepper.tsx`：

```ts
import type { InstallPhase } from '../model/types';
```

并将 props `phase` 改为 `InstallPhase`。

## 任务 3：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 不重命名 API 函数 `inspectStage1Dashboard` 和 `readStage1InstallLogTail`。
- 不删除 `model/types.ts` 中的 `Stage1*` 兼容别名。
- 不修改 UI 文案、CSS class、运行逻辑或文件路径。
