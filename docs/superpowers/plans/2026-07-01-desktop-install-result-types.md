# Desktop Install Result Types 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将安装完成后面板和 channel controller 层的 `Stage1InstallResult` 类型引用迁移为 `OpenClawInstallResult`。

**架构：** `model/types.ts` 保留旧别名作为兼容边界；业务组件和 channel 层使用 neutral 主类型，避免 stage-1 语义继续向内传播。本轮只替换 TypeScript 类型引用，不改 UI 文案、运行逻辑、文件路径或 Tauri 命令。

**技术栈：** TypeScript、React、Vitest。

---

## 文件结构

- 创建：`apps/desktop/tests/install-result-type-names.test.ts`
  - 职责：扫描 desktop stage1 feature 源码，约束旧 `Stage1InstallResult` 只存在于兼容类型别名定义。
- 修改：`apps/desktop/src/features/stage1/components/post-install-entry-view.tsx`
  - 职责：安装完成入口摘要视图。
- 修改：`apps/desktop/src/features/stage1/components/runtime-operations-panel.tsx`
  - 职责：运行时操作面板。
- 修改：`apps/desktop/src/features/stage1/components/post-install-views.tsx`
  - 职责：安装完成后视图组合。
- 修改：`apps/desktop/src/features/stage1/components/provider-setup-panel.tsx`
  - 职责：Provider 配置面板。
- 修改：`apps/desktop/src/features/stage1/components/skills-management-panel.tsx`
  - 职责：技能管理面板。
- 修改：`apps/desktop/src/features/stage1/components/service-control-panel.tsx`
  - 职责：服务控制面板。
- 修改：`apps/desktop/src/features/stage1/components/uninstall-panel.tsx`
  - 职责：卸载面板。
- 修改：`apps/desktop/src/features/stage1/channels/*/{model,components}/*`
  - 职责：各 channel controller 与 plugin panel 的安装结果依赖类型。

## 任务 1：红灯测试

- [ ] **步骤 1：新增扫描测试**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('install result type names', () => {
  it('keeps Stage1InstallResult only as a compatibility alias', () => {
    const root = join(process.cwd(), 'src/features/stage1');
    const files = readSourceFiles(root);
    const offenders = files
      .map((file) => ({
        file,
        text: readFileSync(file, 'utf8')
      }))
      .filter(({ file, text }) => {
        const rel = relative(root, file).replaceAll('\\', '/');
        if (rel === 'model/types.ts') {
          return !text.includes('export type Stage1InstallResult = OpenClawInstallResult;');
        }
        return text.includes('Stage1InstallResult');
      })
      .map(({ file }) => relative(root, file).replaceAll('\\', '/'));

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test -- install-result-type-names"`

预期：FAIL，列出仍引用 `Stage1InstallResult` 的组件和 channel 文件。

## 任务 2：迁移组件类型引用

- [ ] **步骤 1：替换组件导入和 props 类型**

将以下文件的 `Stage1InstallResult` 替换为 `OpenClawInstallResult`：

- `components/post-install-entry-view.tsx`
- `components/runtime-operations-panel.tsx`
- `components/post-install-views.tsx`
- `components/provider-setup-panel.tsx`
- `components/skills-management-panel.tsx`
- `components/service-control-panel.tsx`
- `components/uninstall-panel.tsx`

仅替换类型导入和类型注解。

## 任务 3：迁移 channel 类型引用

- [ ] **步骤 1：替换 channel controller 和 panel 类型**

将以下路径下的 `Stage1InstallResult` 替换为 `OpenClawInstallResult`：

- `channels/dingtalk/model/dingtalk-channel-controller.ts`
- `channels/dingtalk/components/dingtalk-plugin-panel.tsx`
- `channels/wechat/model/wechat-channel-controller.ts`
- `channels/wechat/components/wechat-plugin-panel.tsx`
- `channels/qqbot/model/qqbot-channel-controller.ts`
- `channels/qqbot/components/qqbot-plugin-panel.tsx`
- `channels/feishu/model/feishu-channel-controller.ts`
- `channels/feishu/components/feishu-plugin-panel.tsx`

## 任务 4：验证

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop test"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 不重命名 `features/stage1` 目录。
- 不删除 `Stage1InstallResult` 兼容别名。
- 不修改 JSX 文案、状态机、Tauri command 或 Rust 逻辑。
