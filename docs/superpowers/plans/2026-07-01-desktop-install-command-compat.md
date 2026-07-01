# Desktop Install Command 兼容层实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增 neutral 的安装 Tauri command 名称，让前端 API 改用新 command，同时保留旧 `stage1` command 兼容入口。

**架构：** Rust command 层提供新函数名和旧函数名，二者调用同一组内部 helper；前端 `stage1-api.ts` 先保持文件路径不动，只切换 invoke command 字符串，避免同时做目录级重命名。

**技术栈：** Rust/Tauri、React TypeScript、Vitest。

---

## 文件结构

- 修改：`apps/desktop/src-tauri/src/commands/workflow.rs`
  - 职责：新增 `inspect_install_dashboard_command`、`start_openclaw_install`、`read_install_log_tail_command`，旧 command 内部转调新 command。
- 修改：`apps/desktop/src-tauri/src/lib.rs`
  - 职责：注册新旧两套 Tauri command。
- 修改：`apps/desktop/src/features/stage1/api/stage1-api.ts`
  - 职责：前端 API 改用 neutral command 字符串。
- 创建：`apps/desktop/tests/stage1-api-command-names.test.ts`
  - 职责：锁定前端 API 使用的新 command 名。

## 任务 1：前端 API command 名测试

- [ ] **步骤 1：编写失败测试**

创建 `apps/desktop/tests/stage1-api-command-names.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { inspectStage1Dashboard, readStage1InstallLogTail, startStage1Install } from '../src/features/stage1/api/stage1-api';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

describe('stage1 API command names', () => {
  it('uses neutral install workflow commands', async () => {
    invokeMock.mockResolvedValueOnce({
      workflowId: null,
      phase: 'precheck',
      currentStep: null,
      currentStepLabel: '',
      progress: 0,
      completedSteps: [],
      failedStep: null,
      message: null,
      steps: [],
      environment: [],
      installMode: 'local',
      selectedVersion: 'latest',
      openclawVersion: null,
      nodeVersion: null,
      baseDir: '',
      systemOpenclaw: { detected: false, executable: null, version: null, error: null },
      systemNode: { detected: false, executable: null, version: null, satisfiesRequirement: null, error: null },
      installPlan: { targetOpenclawVersion: null, targetNodeVersion: null, action: 'install', requiresConfirmation: false }
    });
    invokeMock.mockResolvedValueOnce({ workflowId: 'wf', status: 'ok', openclawVersion: '1', nodeVersion: '1', openclawDir: '', nodeDir: '', configPath: '' });
    invokeMock.mockResolvedValueOnce({ path: '', lines: [], truncated: false });

    await inspectStage1Dashboard({ baseDir: '', licenseKey: '', installMode: 'local', selectedVersion: 'latest' });
    await startStage1Install({ baseDir: '', licenseKey: '', installMode: 'local', selectedVersion: 'latest' });
    await readStage1InstallLogTail('', 20);

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      'inspect_install_dashboard_command',
      'start_openclaw_install',
      'read_install_log_tail_command'
    ]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm exec vitest run apps/desktop/tests/stage1-api-command-names.test.ts"
```

预期：FAIL，因为当前前端仍调用旧 command。

## 任务 2：新增 Rust command 兼容层

- [ ] **步骤 1：实现 command helper**

在 `commands/workflow.rs` 中提取私有 async helper：

```rust
async fn inspect_install_dashboard(input: Stage1InstallInput) -> Result<Stage1Dashboard, String>
async fn start_install(input: Stage1InstallInput) -> Result<Stage1InstallResult, String>
async fn read_install_log_tail(base_dir: String, max_lines: Option<usize>) -> Result<Stage1InstallLogTail, String>
```

- [ ] **步骤 2：新增 neutral Tauri command**

新增：

```rust
#[tauri::command]
pub async fn inspect_install_dashboard_command(...)

#[tauri::command]
pub async fn start_openclaw_install(...)

#[tauri::command]
pub async fn read_install_log_tail_command(...)
```

- [ ] **步骤 3：旧 command 转调**

旧函数保留：

```rust
inspect_stage1_dashboard_command -> inspect_install_dashboard
start_stage1_install -> start_install
read_stage1_install_log_tail_command -> read_install_log_tail
```

- [ ] **步骤 4：注册新 command**

在 `lib.rs` 的 `generate_handler!` 同时注册新旧 command。

## 任务 3：前端 API 切换新 command

- [ ] **步骤 1：修改 invoke 字符串**

在 `stage1-api.ts` 中替换：

```text
inspect_stage1_dashboard_command -> inspect_install_dashboard_command
start_stage1_install -> start_openclaw_install
read_stage1_install_log_tail_command -> read_install_log_tail_command
```

- [ ] **步骤 2：运行验证**

运行：

```bash
rtk proxy powershell -NoProfile -Command "pnpm exec vitest run apps/desktop/tests/stage1-api-command-names.test.ts"
rtk proxy powershell -NoProfile -Command "pnpm --filter @openclaw-toolkit/desktop typecheck"
rtk proxy powershell -NoProfile -Command "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib"
```

预期：全部 PASS。

## 自检

- 本轮不重命名 `features/stage1` 目录。
- 本轮不重命名 TypeScript 类型。
- 旧 Tauri command 必须继续注册，保证兼容。
