# Tauri OpenClaw 卸载链路设计

## 结论

当前项目架构适合把卸载做成 Rust Core 的一条独立维护链路，而不是塞进前端或 NSIS 脚本里硬删路径。

推荐方案：

1. 应用内提供“卸载 OpenClaw 环境”向导，负责预览、确认、停止运行时、删除受管数据、更新 registry。
2. Tauri NSIS 卸载器只作为兜底入口：默认卸载 Toolkit 应用本体；可通过 NSIS hook 调起清理 helper 或提示用户先在应用内清理 OpenClaw 数据。
3. 删除动作只允许发生在安装注册中心证明过的 owned roots 下：`baseDir`、`openclawDir`、`nodeDir`、Toolkit app data。任何外部路径只做提示，不自动删除。
4. 递归删除建议使用 Rust crate `remove_dir_all`，启用 `parallel` feature，并优先采用“先重命名到墓碑目录，再后台删除”的模式，避免 UI 卡死和 `node_modules` 慢删带来的失败体验。

## 架构核验

现有架构分层是清晰的：

- React/Vite 前端负责安装向导、安装后控制台和用户确认。
- Tauri command 是唯一前后端边界。
- Rust Core 已经包含 app state、workflow、process、runtime、manifest、openclaw_config、skills、plugins 等核心模块。
- 安装状态已经有两层事实来源：
  - 应用级：`settings.json`、`install-registry.json`，位于 Tauri/ProjectDirs app data。
  - 实例级：`installed-manifest.json`，位于 `baseDir/openclaw/<version>/`。

卸载链路应复用这个结构：

```text
React Uninstall UI
  -> Tauri commands::uninstall
  -> core::uninstall planner / executor
  -> core::process stop runtime
  -> safe deletion service
  -> core::app_state registry cleanup
  -> bootstrap_app_state 回到 installer
```

不建议让 NSIS 脚本直接删除 `D:\OpenClaw`。NSIS 不知道当前 active installation、用户是否使用自定义目录、哪些目录是受管目录，也不适合处理 node_modules 级别的大树删除。

## 外部参考

Tauri v2 官方 Windows installer 文档说明 Windows 包分为 WiX `.msi` 和 NSIS `-setup.exe`；当前项目使用 NSIS。Tauri 的 NSIS 配置支持 `NSIS_HOOK_PREUNINSTALL` 和 `NSIS_HOOK_POSTUNINSTALL`，分别在卸载文件/注册表/快捷方式前后运行；`perMachine` 会安装到 Program Files 并需要管理员权限，注册信息走 HKLM。参考：

- <https://v2.tauri.app/distribute/windows-installer/>
- <https://v2.tauri.app/reference/config/>

OpenClaw 官方卸载语义是按 scope 删除：`--service`、`--state`、`--workspace`、`--app`、`--all`，支持 `--dry-run` 预览、`--yes` 确认和 `--non-interactive` 自动化。官方文档还强调 state 删除默认不删 workspace，除非显式选择 workspace；删除前建议备份。参考：

- <https://docs.openclaw.ai/install/uninstall>
- <https://docs.openclaw.ai/cli/uninstall>

主流工程项目的共同模式：

- Docker Desktop 明确警告卸载会销毁容器、镜像、卷等本机数据，并提供 `-keep-data` / 残留目录清理说明。参考 <https://docs.docker.com/desktop/uninstall/>
- VS Code 标准卸载不默认删除用户数据；如果要完全清除，需要用户手动删除 user data 和 extensions 目录。参考 <https://code.visualstudio.com/docs/setup/uninstall>
- JetBrains Toolbox 也把应用卸载、开机启动清理、应用目录删除拆成步骤，并要求先退出应用。参考 <https://www.jetbrains.com/help/toolbox-app/toolbox-app-silent-installation.html>

工程级结论：卸载本体和清理用户/运行数据应分层；数据清理必须先预览并要求明确确认。

## 删除范围模型

卸载必须以 scope 表达，而不是一个“全部删除”按钮直接开删。

```ts
type UninstallScope =
  | 'runtime'       // 停止 OpenClaw runtime / gateway
  | 'openclawApp'   // 删除 baseDir/openclaw/<version>
  | 'managedNode'   // 删除受管 Node runtime，如果没有其他安装实例引用
  | 'skills'        // 删除 baseDir/skills
  | 'workspace'     // 删除 workspace，包含用户/agent 产物，默认不选
  | 'logs'          // 删除 baseDir/logs
  | 'backups'       // 删除 baseDir/backups
  | 'toolkitState'; // 删除 Toolkit app data 中 registry/settings/cache
```

默认推荐：

- 普通卸载：`runtime + openclawApp + logs + registry record`
- 完全清理：再加 `managedNode + skills + workspace + backups + toolkitState`
- workspace 默认不选，必须二次确认，因为里面可能包含用户文件、agent 工作成果、会话数据、凭证痕迹。

## 数据清单

按当前安装设计，受管数据主要在：

```text
<baseDir>\
  openclaw\<version>\             OpenClaw 包、package/node_modules、openclaw.json、installed-manifest.json
  runtimes\node\<node-version>\    受管 Node runtime
  skills\                          受管 skill 目录
  logs\                            安装日志和运行日志
  backups\                         安装/升级备份

Toolkit app data:
  settings.json
  install-registry.json
```

还需要识别但不自动删除：

- `openclaw.json` 中配置的 workspace，如果不在 `<baseDir>` 下，只展示为“外部工作区”，默认不选且不可自动选择。
- `OPENCLAW_CONFIG_PATH` 指向的外部配置文件。
- 系统 PATH 中检测到的全局 OpenClaw 或全局 Node。
- npm/pnpm/bun 全局安装的 OpenClaw。

## 安全边界

删除前必须构造 `UninstallPlan`，所有删除项都要有 `reason`、`scope`、`path`、`estimatedSize`、`owned`、`selectedByDefault`。

Owned path 判定规则：

1. 必须来自 registry record 或 installed manifest，不接受前端传入任意路径作为删除目标。
2. `openclawDir` 必须等于或位于 `<baseDir>\openclaw\<version>`。
3. `nodeDir` 必须等于或位于 `<baseDir>\runtimes\node\<node-version>`。
4. `skills/logs/backups` 必须是 `<baseDir>` 的直接子目录，且目录名在 allowlist。
5. `workspace` 只有在位于 `<baseDir>` 下时才允许进入可选删除项；外部 workspace 仅提示用户手动处理。
6. 禁止删除盘符根、用户主目录、`Program Files`、`Windows`、`System32`、`AppData` 根目录、项目工作区根目录。
7. 删除前使用 `canonicalize` 或 Windows final path 解析；解析失败时只允许删除不存在项的 registry 记录，不执行文件删除。
8. 遇到 symlink / junction / reparse point：删除链接本身，不跟随删除目标。对于不确定的 reparse point，计划阶段标红并跳过。
9. 每个 deletion target 需要在 plan 阶段和 execute 阶段重复校验一次，防止 UI 确认后路径被替换。

用户确认建议：

- 普通卸载：确认按钮文案为“卸载 OpenClaw 环境”。
- 完全清理：要求输入 `DELETE OPENCLAW` 或勾选逐项 scope。
- workspace/外部路径：单独警告“包含用户或 agent 工作数据，删除后不可恢复”。

## 卸载流程

### 1. 预览

```text
inspect_uninstall_plan(installationId)
  -> load registry
  -> load installed-manifest
  -> read openclaw status/config
  -> discover runtime pid/log/workspace
  -> resolve candidate deletion targets
  -> estimate sizes
  -> return plan
```

前端展示：

- 会停止的进程：runtime pid、状态。
- 会删除的目录/文件：路径、大小、scope、是否默认选中。
- 会保留的内容：外部 workspace、全局 OpenClaw、全局 Node、非受管目录。
- 风险提示：workspace/backups 包含用户数据时高亮。

### 2. 执行

```text
execute_uninstall(planId, selectedScopes, confirmation)
  -> reload plan
  -> compare selected scopes
  -> validate confirmation
  -> stop runtime if running
  -> mark registry status = uninstalling
  -> rename selected directories to <baseDir>\.trash\uninstall-<timestamp>\...
  -> update registry remove/deactivate installation
  -> delete tombstone directories in background/blocking worker
  -> emit progress
  -> bootstrap_app_state -> installer
```

先 rename 再 delete 的好处：

- 对用户来说卸载几乎立即生效。
- `node_modules` 慢删不会让主状态悬挂在半卸载。
- 如果 delete 中途失败，残留集中在 `.trash\uninstall-*`，可以提供“继续清理残留”入口。

注意：rename 也必须只在同一 volume 内执行；如果不能 rename，就退回直接删除并保持进度。

### 3. 失败恢复

失败不应回滚已删除数据，而是记录可恢复状态：

```json
{
  "status": "uninstallFailed",
  "lastError": "...",
  "pendingCleanupRoots": [
    "D:\\OpenClaw\\.trash\\uninstall-20260609-..."
  ]
}
```

下次启动 `bootstrap_app_state`：

- 如果 active installation 已被移除且有 pending cleanup，显示“发现待清理残留”。
- 用户可点击“继续清理”。
- 如果 manifest 已不存在但 registry 还在，允许清除 registry 记录。

## Rust 删除库选择

推荐引入：

```toml
remove_dir_all = { version = "1", features = ["parallel"] }
```

理由：

- 它是 Rust 侧更接近 Node `rimraf` 的递归删除库。
- 文档说明其目标是可靠删除目录树，并且 `parallel` feature 能并行化删除，对 Windows、网络盘等 syscall latency 高的场景有帮助。
- 它强调安全和鲁棒性优先，目录遍历只向下，避免 symlink 逃逸；当前 v1 文档也推荐在敏感场景优先考虑更安全的 handle-based/contents 删除接口。

备选：

- `std::fs::remove_dir_all`：依赖少，但删 `node_modules` 体验可能慢；适合作为 fallback。
- `fs_extra`：有 `remove_items/remove`，更偏文件操作工具箱，不是专门为安全/高性能删除设计。
- `jwalk + rayon + std remove_file`：可以自研并行删除，但需要自己处理 symlink、reparse point、权限、错误聚合和顺序，维护成本更高。
- `delete` crate：宣称 node_modules 级别快速删除，但生态成熟度和安全边界需要额外审计，不建议直接作为第一选择。

实现建议：

- 不把删除库暴露给前端。
- 做 `core::safe_delete` 封装，统一处理 owned path 校验、reparse point、rename-to-trash、progress、retry。
- 删除失败时不要静默吞掉；聚合错误后展示“哪些路径未删除”。

## Tauri NSIS 卸载器设计

当前 `tauri.conf.json` 使用：

```json
"bundle": {
  "targets": ["nsis"],
  "windows": {
    "nsis": { "installMode": "perMachine" }
  }
}
```

建议新增 NSIS hook 文件，例如：

```text
apps/desktop/src-tauri/nsis/uninstall-hooks.nsh
```

并在配置中挂载。hook 职责要克制：

- `PREUNINSTALL`：如果 Toolkit 正在运行，提示关闭或尝试退出。
- `POSTUNINSTALL`：删除 Toolkit 自身开机启动 registry value；可提示存在 OpenClaw 受管数据，需要通过安装目录或 helper 清理。

如果必须支持“控制面板卸载时也清 OpenClaw 数据”，建议随应用打包一个 Rust cleanup helper：

```text
openclaw-toolkit-cleanup.exe --plan-from-app-data --interactive
openclaw-toolkit-cleanup.exe --plan-from-app-data --all --yes
```

NSIS 调 helper，不在 NSIS 中写删除逻辑。helper 用同一套 `core::uninstall` 代码，避免应用内和卸载器行为不一致。

## 前端入口

在安装后首页增加“危险操作”或“卸载”入口，不建议放在首屏主操作区。

UI 结构：

1. 打开卸载对话框。
2. 调 `inspect_uninstall_plan`。
3. 展示分组：
   - 将停止的服务
   - 将删除的数据
   - 默认保留的数据
   - 需要手动处理的数据
4. 用户选择 scope。
5. 高风险 scope 需要二次确认。
6. 调 `execute_uninstall` 并显示进度。
7. 完成后回到安装向导。

文案重点：

- “这会删除 OpenClaw 受管运行环境和本机数据。”
- “工作区可能包含用户文件、agent 产物、会话和凭证痕迹。”
- “外部工作区不会自动删除。”
- “全局 Node.js / 全局 OpenClaw 不属于本工具包安装范围，不会删除。”

## 后端 API 草案

```rust
#[derive(Serialize)]
pub struct UninstallPlan {
    pub plan_id: String,
    pub installation_id: String,
    pub display_name: String,
    pub runtime: RuntimeStopPlan,
    pub targets: Vec<DeletionTarget>,
    pub retained: Vec<RetainedPath>,
    pub warnings: Vec<String>,
    pub requires_typed_confirmation: bool,
}

#[derive(Serialize)]
pub struct DeletionTarget {
    pub scope: String,
    pub path: String,
    pub kind: String,
    pub estimated_bytes: Option<u64>,
    pub selected_by_default: bool,
    pub risk: String,
    pub reason: String,
}

#[derive(Deserialize)]
pub struct ExecuteUninstallInput {
    pub installation_id: String,
    pub selected_scopes: Vec<String>,
    pub typed_confirmation: Option<String>,
}
```

Tauri commands：

```rust
inspect_uninstall_plan_command(installation_id: String) -> Result<UninstallPlan, String>
execute_uninstall_command(input: ExecuteUninstallInput) -> Result<UninstallResult, String>
read_uninstall_log_tail_command(base_dir: String, max_lines: Option<usize>) -> Result<Stage1InstallLogTail, String>
```

事件：

```text
openclaw://uninstall-progress
```

## Registry 更新规则

执行完成后：

- 从 `install-registry.json.installations` 移除该 installation。
- 如果是 active installation，清空 `activeInstallationId`。
- 从 `settings.recentInstallationIds` 移除该 installation。
- 如果用户选择 `toolkitState`，删除 Toolkit app data 中 registry/settings；但不要影响 Windows 安装器自身 registry。
- `bootstrap_app_state` 返回 `screen = "installer"`。

多实例情况下：

- 只删除被选中的 installation。
- `nodeDir` 只有没有其他 installation 引用同一路径时才可删除。
- `skills/logs/backups` 如果是共享 baseDir，默认保留，除非用户选择“清理整个安装根目录”且该 baseDir 下没有其他有效 installation。

## 测试策略

Rust 单元测试：

- owned path 判定：合法/非法路径、大小写、`..`、盘符根、用户目录、Program Files、workspace root。
- workspace 识别：baseDir 内可选，baseDir 外保留。
- 多实例引用：共享 node runtime 不删除。
- missing manifest：只清 registry，不删未知路径。
- symlink/junction：不跟随外部目标。

集成测试：

- 构造临时 baseDir，包含 `openclaw/<version>/package/node_modules` 大量小文件，验证 rename-to-trash 和删除完成。
- runtime pid 存在时先 stop。
- 删除中断后再次执行 pending cleanup。
- app bootstrap 在卸载完成后回到 installer。

前端测试：

- plan 展示所有 targets/retained/warnings。
- workspace scope 未默认选中。
- 高风险删除需要输入确认。
- 卸载完成后清掉 post-install 状态。

手动验收：

- 安装到默认 `D:\OpenClaw` 后普通卸载。
- 安装到自定义目录后卸载，不触碰默认目录。
- 外部 workspace 路径不会被删除。
- node_modules 大目录删除时 UI 有进度，不假死。
- 控制面板 NSIS 卸载不会误删受管数据。

