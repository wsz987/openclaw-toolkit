# Desktop-Owned OpenClaw Runtime 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用 Tauri Rust Core 内的单实例 RuntimeManager 取代常驻 openclaw-host daemon，使页面刷新不影响 OpenClaw，并在应用真正退出时可靠停止受管进程。

**架构：** RuntimeManager 作为 Tauri managed state 串行化 start/stop/restart，并通过可注入的 RuntimeProcessAdapter 完成进程创建、身份验证和停止。现有 StatusWatcher 使用轻量 reconcile 推进生命周期，React 只消费后端状态事件；旧 external-helper、daemon 和文件 IPC 全部移除。

**技术栈：** Rust 2021、Tauri 2、serde、chrono、reqwest blocking、Windows process commands、React 19、TypeScript 5、Vitest 3。

---

## 文件结构

### 创建

- `apps/desktop/src-tauri/src/core/runtime_manager.rs`：生命周期状态机、操作串行化、幂等启停、恢复与退出协调。
- `apps/desktop/src-tauri/src/core/runtime_process.rs`：官方 Gateway CLI 适配、`/healthz`/`/readyz` 探测、Windows 进程身份回退和有界停止。
- `apps/desktop/src/openclaw/model/runtime-state.ts`：前端运行状态规范化和展示模型。
- `apps/desktop/tests/runtime-state.test.ts`：前端状态映射测试。
- `apps/desktop/tests/no-runtime-host-daemon.test.ts`：防止 external helper 和文件 IPC 回归。

### 修改

- `apps/desktop/src-tauri/src/core/mod.rs`：导出 runtime manager 与 process adapter。
- `apps/desktop/src-tauri/src/core/process/mod.rs`：移除已迁移的 Gateway lifecycle 函数，保留 OpenClaw CLI/版本发现职责。
- `apps/desktop/src-tauri/src/core/openclaw_config/mod.rs`：暴露轻量 HTTP liveness/readiness 与端口 PID 查询，不承担 lifecycle 状态写入。
- `apps/desktop/src-tauri/src/core/app_state/mod.rs`：让安装注册表保存 RuntimeSnapshot 的恢复字段和失败原因。
- `apps/desktop/src-tauri/src/core/status_watcher.rs`：通过 RuntimeManager reconcile 推进状态并采用分状态轮询间隔。
- `apps/desktop/src-tauri/src/core/status_events.rs`：统一发送包含 gatewayReady 和 runtimeError 的状态快照。
- `apps/desktop/src-tauri/src/commands/post_install.rs`：将 runtime commands 改为 RuntimeManager 的薄适配层。
- `apps/desktop/src-tauri/src/core/uninstall.rs`：卸载前通过 RuntimeManager 停止受管实例。
- `apps/desktop/src-tauri/src/lib.rs`：注册 RuntimeManager，并在真正退出应用时执行 bounded shutdown。
- `apps/desktop/src/openclaw/model/types.ts`：收紧 RuntimeLifecycleState 类型并增加 gatewayReady 与 runtimeError。
- `apps/desktop/src/openclaw/api/client.ts`：使用统一 RuntimeSnapshot 响应。
- `apps/desktop/src/openclaw/hooks/use-openclaw-installer.ts`：启动请求返回后依赖后端状态事件，不以 invoke promise 代表完整 ready。
- `apps/desktop/src/features/dashboard/components/service-control-panel.tsx`：展示 starting/stopping/failed，并允许 failed 后重新启动。

### 删除

- `apps/desktop/src-tauri/src/core/runtime_host.rs`：删除 external-helper/direct-process backend 分派。
- `apps/desktop/src-tauri/src/bin/openclaw-host.rs`：删除 daemon、文件 IPC 和独立 helper 二进制。

## 任务 1：建立可测试的生命周期状态模型

**文件：**
- 创建：`apps/desktop/src-tauri/src/core/runtime_manager.rs`
- 修改：`apps/desktop/src-tauri/src/core/mod.rs`

- [ ] **步骤 1：编写失败的状态转换测试**

在 `runtime_manager.rs` 创建测试模块，先声明测试所需行为：

```rust
#[cfg(test)]
mod tests {
    use super::{reduce_observation, RuntimeLifecycleState, RuntimeObservation};

    #[test]
    fn starting_becomes_running_only_after_gateway_is_ready() {
        let running = reduce_observation(
            RuntimeLifecycleState::Starting,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: true,
                port_owner_matches: true,
                startup_timed_out: false,
            },
        );

        assert_eq!(running, RuntimeLifecycleState::Running);
    }

    #[test]
    fn running_process_exit_becomes_failed_without_restart() {
        let failed = reduce_observation(
            RuntimeLifecycleState::Running,
            RuntimeObservation {
                process_alive: false,
                gateway_live: false,
                gateway_ready: false,
                port_owner_matches: false,
                startup_timed_out: false,
            },
        );

        assert_eq!(failed, RuntimeLifecycleState::Failed);
    }

    #[test]
    fn startup_timeout_becomes_failed() {
        let failed = reduce_observation(
            RuntimeLifecycleState::Starting,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: false,
                port_owner_matches: false,
                startup_timed_out: true,
            },
        );

        assert_eq!(failed, RuntimeLifecycleState::Failed);
    }

    #[test]
    fn running_stays_running_when_readiness_temporarily_drops() {
        let running = reduce_observation(
            RuntimeLifecycleState::Running,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: false,
                port_owner_matches: true,
                startup_timed_out: false,
            },
        );

        assert_eq!(running, RuntimeLifecycleState::Running);
    }
}
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_manager::tests
```

预期：FAIL，提示 `reduce_observation`、`RuntimeLifecycleState` 和 `RuntimeObservation` 尚未定义。

- [ ] **步骤 3：实现状态类型和纯转换函数**

在 `runtime_manager.rs` 添加：

```rust
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeLifecycleState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub state: RuntimeLifecycleState,
    pub config_path: Option<PathBuf>,
    pub pid: Option<u32>,
    pub log_path: Option<PathBuf>,
    pub started_at: Option<DateTime<Utc>>,
    pub ready_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub adopted: bool,
    pub gateway_live: bool,
    pub gateway_ready: bool,
}

impl Default for RuntimeSnapshot {
    fn default() -> Self {
        Self {
            state: RuntimeLifecycleState::Stopped,
            config_path: None,
            pid: None,
            log_path: None,
            started_at: None,
            ready_at: None,
            last_error: None,
            adopted: false,
            gateway_live: false,
            gateway_ready: false,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeObservation {
    pub process_alive: bool,
    pub gateway_live: bool,
    pub gateway_ready: bool,
    pub port_owner_matches: bool,
    pub startup_timed_out: bool,
}

pub fn reduce_observation(
    current: RuntimeLifecycleState,
    observation: RuntimeObservation,
) -> RuntimeLifecycleState {
    match current {
        RuntimeLifecycleState::Starting if observation.startup_timed_out => {
            RuntimeLifecycleState::Failed
        }
        RuntimeLifecycleState::Starting
            if observation.process_alive
                && observation.gateway_ready
                && observation.port_owner_matches =>
        {
            RuntimeLifecycleState::Running
        }
        RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running
            if !observation.process_alive =>
        {
            RuntimeLifecycleState::Failed
        }
        RuntimeLifecycleState::Running if !observation.port_owner_matches => {
            RuntimeLifecycleState::Failed
        }
        state => state,
    }
}
```

在 `core/mod.rs` 中增加 `pub mod runtime_manager;`。

- [ ] **步骤 4：运行测试确认通过**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_manager::tests
```

预期：3 个状态转换测试 PASS。

- [ ] **步骤 5：提交状态模型**

```powershell
rtk git add apps/desktop/src-tauri/src/core/runtime_manager.rs apps/desktop/src-tauri/src/core/mod.rs
rtk git commit -m "feat: add desktop runtime lifecycle state"
```

## 任务 2：抽离并验证受管进程操作

**文件：**
- 创建：`apps/desktop/src-tauri/src/core/runtime_process.rs`
- 修改：`apps/desktop/src-tauri/src/core/process/mod.rs`
- 修改：`apps/desktop/src-tauri/src/core/openclaw_config/mod.rs`
- 修改：`apps/desktop/src-tauri/src/core/mod.rs`

- [ ] **步骤 1：编写进程身份和停止策略测试**

在 `runtime_process.rs` 的测试模块中添加：

```rust
#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;

    use super::{
        identity_matches_context, ManagedProcessIdentity, OfficialGatewayStatus,
    };
    use crate::core::openclaw_config::OpenClawRuntimeContext;

    fn context() -> OpenClawRuntimeContext {
        OpenClawRuntimeContext {
            openclaw_dir: r"D:\OpenClaw\openclaw\2026.5.20".to_string(),
            node_dir: r"D:\OpenClaw\runtimes\node\22.19.0-win-x64".to_string(),
            config_path: r"D:\OpenClaw\openclaw\2026.5.20\openclaw.json".to_string(),
            gateway_url: "http://127.0.0.1:18789".to_string(),
            runtime_log_path: r"D:\OpenClaw\openclaw\2026.5.20\logs\gateway-runtime.log".to_string(),
        }
    }

    #[test]
    fn accepts_managed_node_and_openclaw_gateway_command() {
        let identity = ManagedProcessIdentity {
            pid: 4321,
            executable_path: PathBuf::from(
                r"D:\OpenClaw\runtimes\node\22.19.0-win-x64\node.exe",
            ),
            command_line: r#"node.exe D:\OpenClaw\openclaw\2026.5.20\package\openclaw.mjs gateway run"#.to_string(),
        };

        assert!(identity_matches_context(&identity, &context()));
    }

    #[test]
    fn rejects_unrelated_process_on_gateway_port() {
        let identity = ManagedProcessIdentity {
            pid: 9876,
            executable_path: PathBuf::from(r"C:\Program Files\Other\server.exe"),
            command_line: "server.exe --port 18789".to_string(),
        };

        assert!(!identity_matches_context(&identity, &context()));
    }

    #[test]
    fn parses_openclaw_2026_5_20_gateway_status_shape() {
        let status: OfficialGatewayStatus = serde_json::from_value(json!({
            "service": {
                "label": "Scheduled Task",
                "loaded": false,
                "runtime": {
                    "status": "stopped",
                    "detail": "ERROR: The system cannot find the file specified.",
                    "missingUnit": true
                }
            },
            "extraServices": []
        }))
        .unwrap();

        assert!(!status.service.loaded);
        assert_eq!(
            status.service.runtime.as_ref().unwrap().status.as_deref(),
            Some("stopped")
        );
        assert!(!status.has_service_conflict());
    }

    #[test]
    fn active_or_extra_official_service_is_a_conflict() {
        let status: OfficialGatewayStatus = serde_json::from_value(json!({
            "service": {
                "installed": true,
                "loaded": true,
                "running": true,
                "runtime": { "status": "running", "pid": 4321 }
            },
            "extraServices": [{ "label": "OpenClaw Gateway (legacy)" }]
        }))
        .unwrap();

        assert!(status.has_service_conflict());
    }
}
```

- [ ] **步骤 2：运行测试确认失败**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_process::tests
```

预期：FAIL，提示 `runtime_process` 模块及其类型不存在。

- [ ] **步骤 3：定义可注入的进程适配接口**

在 `runtime_process.rs` 定义生产实现与测试替身共用的接口：

```rust
use std::path::PathBuf;

use serde::Deserialize;

use crate::core::openclaw_config::OpenClawRuntimeContext;

#[derive(Debug, Clone)]
pub struct ManagedProcessIdentity {
    pub pid: u32,
    pub executable_path: PathBuf,
    pub command_line: String,
}

#[derive(Debug, Clone)]
pub struct RuntimeLaunch {
    pub pid: u32,
    pub log_path: PathBuf,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGatewayStatus {
    pub service: OfficialGatewayServiceStatus,
    #[serde(default)]
    pub extra_services: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGatewayServiceStatus {
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub loaded: bool,
    #[serde(default)]
    pub running: bool,
    #[serde(default)]
    pub runtime: Option<OfficialGatewayRuntimeStatus>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGatewayRuntimeStatus {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
}

impl OfficialGatewayStatus {
    pub fn has_service_conflict(&self) -> bool {
        self.service.installed
            || self.service.loaded
            || self.service.running
            || self
                .service
                .runtime
                .as_ref()
                .and_then(|runtime| runtime.status.as_deref())
                .is_some_and(|status| status.eq_ignore_ascii_case("running"))
            || !self.extra_services.is_empty()
    }
}

pub trait RuntimeProcessAdapter: Send + Sync {
    fn launch(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<RuntimeLaunch>;
    fn is_alive(&self, pid: u32) -> bool;
    fn port_owner(&self, gateway_url: &str) -> Option<u32>;
    fn gateway_liveness(&self, gateway_url: &str) -> bool;
    fn gateway_readiness(&self, gateway_url: &str) -> bool;
    fn official_status(
        &self,
        context: &OpenClawRuntimeContext,
    ) -> anyhow::Result<OfficialGatewayStatus>;
    fn request_official_stop(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<()>;
    fn identity(&self, pid: u32) -> anyhow::Result<ManagedProcessIdentity>;
    fn force_stop_tree(&self, pid: u32) -> anyhow::Result<()>;
}

#[derive(Debug, Default)]
pub struct SystemRuntimeProcessAdapter;
```

`identity_matches_context` 必须同时验证：简化后的 executable path 位于 `context.node_dir`、命令行包含当前安装的 `package\openclaw.mjs`、并包含独立参数 `gateway run`。比较路径时使用现有 `process_friendly_path` 和不区分大小写的 Windows 路径比较。这个身份查询只用于崩溃恢复、旧 Host 迁移和官方停止超时后的最终保护，不作为正常停止的首选协议。

- [ ] **步骤 4：迁移 Gateway 启动与停止实现**

把 `launch_managed_openclaw_from_context` 从 `core/process/mod.rs` 移入 `SystemRuntimeProcessAdapter::launch`，保持以下进程参数不变：

```rust
command
    .arg(&openclaw_entry)
    .arg("gateway")
    .arg("run")
    .env("OPENCLAW_CONFIG_PATH", &context.config_path)
    .env("OPENCLAW_HOME", &context.openclaw_dir)
    .env("OPENCLAW_STATE_DIR", &context.openclaw_dir)
    .current_dir(PathBuf::from(&context.openclaw_dir).join("package"))
    .stdin(Stdio::null())
    .stdout(Stdio::from(stdout))
    .stderr(Stdio::from(stderr));
```

stdout/stderr 必须继续追加到 `gateway-runtime.log`。

`official_status` 使用同一个受管 Node 和 CLI 入口执行 `gateway status --json --deep`；`request_official_stop` 执行 `gateway stop --json`。两者必须设置与启动进程完全相同的 `OPENCLAW_CONFIG_PATH`、`OPENCLAW_STATE_DIR` 和 `OPENCLAW_HOME`，并使用 serde JSON 解析响应。解析时保留官方嵌套层级：当前 `2026.5.20` 读取 `service.loaded`、可选 `service.runtime.status/pid` 和顶层 `extraServices`；同时接受新版本可能增加的 `service.installed`、`service.running`。对响应中缺失的布尔字段使用 serde default；不得把字段假设为顶层值，也不得从人类可读输出做字符串匹配。

`official_status` 只允许由 `RuntimeManager::start` 的 preflight 调用一次。`reconcile` 和 `StatusWatcher` 不调用 CLI，避免 `--deep` 的服务扫描与插件校验进入高频轮询。

`identity(pid)` 在 Windows 上调用 PowerShell `Get-CimInstance Win32_Process -Filter "ProcessId = <pid>"` 并通过 `ConvertTo-Json -Compress` 返回 `ExecutablePath` 与 `CommandLine`；命令输出使用 serde JSON 解析，不按空格手工拆分。`force_stop_tree(pid)` 只能在官方停止超时后调用，并使用 `taskkill /PID <pid> /T /F`。

- [ ] **步骤 5：暴露轻量探测函数**

将 `runtime_pid_for_gateway_url` 保持为 `pub` 轻量函数。新增官方 liveness/readiness 探测，分别请求 `/healthz` 和 `/readyz`，仅接受 HTTP 2xx：

```rust
fn probe_gateway_endpoint(gateway_url: &str, endpoint: &str) -> bool {
    let Ok(base_url) = reqwest::Url::parse(gateway_url) else {
        return false;
    };
    let Ok(url) = base_url.join(endpoint) else {
        return false;
    };

    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(750))
        .build()
        .and_then(|client| client.get(url).send())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

pub fn probe_gateway_liveness(gateway_url: &str) -> bool {
    probe_gateway_endpoint(gateway_url, "/healthz")
}

pub fn probe_gateway_readiness(gateway_url: &str) -> bool {
    probe_gateway_endpoint(gateway_url, "/readyz")
}
```

- [ ] **步骤 6：运行进程适配测试**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_process::tests
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml core::process::tests
```

预期：身份测试和原有版本解析测试全部 PASS。

- [ ] **步骤 7：提交进程适配层**

```powershell
rtk git add apps/desktop/src-tauri/src/core/runtime_process.rs apps/desktop/src-tauri/src/core/process/mod.rs apps/desktop/src-tauri/src/core/openclaw_config/mod.rs apps/desktop/src-tauri/src/core/mod.rs
rtk git commit -m "refactor: isolate managed openclaw process control"
```

## 任务 3：实现幂等 RuntimeManager

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/runtime_manager.rs`

- [ ] **步骤 1：用 FakeAdapter 编写幂等启停测试**

在测试模块实现计数型 FakeAdapter，并增加以下断言：

```rust
#[test]
fn repeated_start_launches_only_one_process() {
    let adapter = FakeAdapter::ready_after_launch(7001);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));
    let config = sample_config_path();

    let first = manager.start(&config).unwrap();
    let second = manager.start(&config).unwrap();

    assert_eq!(first.pid, Some(7001));
    assert_eq!(second.pid, Some(7001));
    assert_eq!(adapter.launch_count(), 1);
}

#[test]
fn unrelated_port_owner_is_never_stopped() {
    let adapter = FakeAdapter::with_unrelated_port_owner(9001);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

    let error = manager.start(&sample_config_path()).unwrap_err();

    assert!(error.to_string().contains("18789"));
    assert_eq!(adapter.stop_count(), 0);
}

#[test]
fn installed_official_gateway_service_blocks_foreground_launch() {
    let adapter = FakeAdapter::with_official_service(true, true, true);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

    let error = manager.start(&sample_config_path()).unwrap_err();

    assert!(error.to_string().contains("Gateway 服务"));
    assert_eq!(adapter.launch_count(), 0);
    assert_eq!(adapter.stop_count(), 0);
}

#[test]
fn process_exit_moves_to_failed_without_relaunch() {
    let adapter = FakeAdapter::ready_after_launch(7001);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));
    manager.start(&sample_config_path()).unwrap();
    adapter.mark_exited(7001);

    let snapshot = manager.reconcile(&sample_config_path()).unwrap();

    assert_eq!(snapshot.state, RuntimeLifecycleState::Failed);
    assert_eq!(adapter.launch_count(), 1);
}
```

- [ ] **步骤 2：运行测试确认失败**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_manager::tests
```

预期：FAIL，提示 `RuntimeManager::start`、`reconcile` 和 FakeAdapter 依赖的接口尚未实现。

- [ ] **步骤 3：实现 Manager 结构和操作锁**

使用两个锁分离“操作串行化”和“快照读取”：

```rust
#[derive(Clone)]
pub struct RuntimeManager {
    adapter: Arc<dyn RuntimeProcessAdapter>,
    operation_lock: Arc<Mutex<()>>,
    snapshot: Arc<Mutex<RuntimeSnapshot>>,
}

impl Default for RuntimeManager {
    fn default() -> Self {
        Self::with_adapter(Arc::new(SystemRuntimeProcessAdapter))
    }
}

impl RuntimeManager {
    pub fn with_adapter(adapter: Arc<dyn RuntimeProcessAdapter>) -> Self {
        Self {
            adapter,
            operation_lock: Arc::new(Mutex::new(())),
            snapshot: Arc::new(Mutex::new(RuntimeSnapshot::default())),
        }
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        self.snapshot.lock().expect("runtime snapshot poisoned").clone()
    }
}
```

所有 start/stop/restart 先获取 `operation_lock`。跨进程临界区使用 `<openclawDir>/.runtime-control.lock`，Windows 打开句柄时设置 `share_mode(0)`；句柄存活期间执行“官方服务检查、reconcile、检查端口、spawn、记录 PID”，离开 start 后自动释放。

- [ ] **步骤 4：实现 start、stop、restart 和 reconcile**

行为必须满足：

```rust
match current.state {
    RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running
        if current.config_path.as_deref() == Some(config_path) => return Ok(current),
    RuntimeLifecycleState::Stopping => anyhow::bail!("OpenClaw 正在停止，请稍后重试"),
    RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running => {
        anyhow::bail!("已有另一个 OpenClaw 实例正在运行")
    }
    RuntimeLifecycleState::Stopped | RuntimeLifecycleState::Failed => {}
}
```

`start` 在 spawn 前调用一次 `official_status`，并用 `status.has_service_conflict()` 判断冲突。当前 `2026.5.20` 主要依据 `service.loaded`、`service.runtime.status` 和 `extraServices`；兼容字段 `service.installed`、`service.running` 也参与判断。存在冲突时返回“检测到官方 Gateway 服务，请先停用后再启动桌面托管模式”，不得自动停止、卸载或清理服务。没有服务冲突时，再检查目标端口；端口被未经验证的监听者占用也必须拒绝。成功 spawn 后立即返回 `Starting`。这些检查只在显式 start 路径执行，不进入 `reconcile` 热轮询。

`reconcile` 分别记录 `gateway_liveness` 与 `gateway_readiness`：PID 存活、端口所有者匹配且只有 `/healthz` 成功时仍保持 `Starting`；只有 `/readyz` 成功才首次进入 `Running`。已经进入 `Running` 后，如果 PID 和端口所有权仍有效但 `/readyz` 暂时失败，保持 `Running` 并更新 `snapshot.gateway_ready=false`，不能开放第二次启动。启动超过 60 秒仍未 ready 时先调用 `request_official_stop`，等待退出；仅当本次会话创建的 PID 仍存活且 `identity_matches_context` 继续成立时调用 `force_stop_tree`，最后进入 `Failed`。

`stop` 首先调用 `request_official_stop`，让 OpenClaw 官方 CLI 验证未托管 Gateway 并发送停止信号。随后最多检查 3 秒，每 200 ms 检查一次；仍存活时，仅允许强制结束本次桌面会话创建且身份未变化的 PID。接管自桌面崩溃前会话的 PID 如果官方 stop 失败，应保留 PID 并返回错误，不能直接强杀。

Windows 前台 Gateway 不依赖 `SIGUSR1` 原地重启。`restart` 在同一个 operation lock 内执行应用级 stop-then-launch：先走上述官方 stop 流程并确认旧 PID 和端口消失，再执行新的 `gateway run`。该流程不得调用服务型 `gateway start`，也不能递归获取公开方法的 operation lock。

- [ ] **步骤 5：增加残留进程接管测试**

```rust
#[test]
fn reconcile_adopts_verified_gateway_after_desktop_restart() {
    let adapter = FakeAdapter::with_verified_running_gateway(8123);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter));

    let snapshot = manager.reconcile(&sample_config_path()).unwrap();

    assert_eq!(snapshot.state, RuntimeLifecycleState::Running);
    assert_eq!(snapshot.pid, Some(8123));
    assert!(snapshot.adopted);
}
```

- [ ] **步骤 6：运行全部 Manager 测试**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_manager::tests
```

预期：状态转换、幂等、官方服务冲突、端口冲突、异常退出和接管测试全部 PASS。

- [ ] **步骤 7：提交 RuntimeManager**

```powershell
rtk git add apps/desktop/src-tauri/src/core/runtime_manager.rs
rtk git commit -m "feat: manage openclaw lifecycle in desktop core"
```

## 任务 4：接入 Tauri commands、注册表与 watcher

**文件：**
- 修改：`apps/desktop/src-tauri/src/commands/post_install.rs`
- 修改：`apps/desktop/src-tauri/src/core/app_state/mod.rs`
- 修改：`apps/desktop/src-tauri/src/core/status_watcher.rs`
- 修改：`apps/desktop/src-tauri/src/core/status_events.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`

- [ ] **步骤 1：编写轮询间隔和状态合并测试**

在 `status_watcher.rs` 测试模块添加：

```rust
#[test]
fn runtime_poll_interval_tracks_lifecycle_state() {
    assert_eq!(runtime_poll_interval(RuntimeLifecycleState::Starting), Duration::from_millis(500));
    assert_eq!(runtime_poll_interval(RuntimeLifecycleState::Running), Duration::from_millis(2500));
    assert_eq!(runtime_poll_interval(RuntimeLifecycleState::Stopping), Duration::from_millis(500));
    assert_eq!(runtime_poll_interval(RuntimeLifecycleState::Stopped), Duration::from_millis(10000));
    assert_eq!(runtime_poll_interval(RuntimeLifecycleState::Failed), Duration::from_millis(10000));
}
```

- [ ] **步骤 2：运行测试确认失败**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_poll_interval_tracks_lifecycle_state
```

预期：FAIL，提示 `runtime_poll_interval` 未定义。

- [ ] **步骤 3：将 commands 改为薄适配层**

三个 command 都注入 `tauri::State<'_, RuntimeManager>`。启动 command 的核心形态为：

```rust
#[tauri::command]
pub async fn launch_openclaw_runtime(
    app: tauri::AppHandle,
    manager: tauri::State<'_, RuntimeManager>,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<RuntimeSnapshot, String> {
    watcher.watch_config_path(&config_path);
    let manager = manager.inner().clone();
    let command_config_path = PathBuf::from(config_path);
    let snapshot = tauri::async_runtime::spawn_blocking(move || manager.start(&command_config_path))
        .await
        .map_err(|error| error.to_string())?
        .map_err(render_error)?;
    refresh_and_emit_openclaw_status(&app, &command_config_path)?;
    Ok(snapshot)
}
```

stop/restart 使用相同结构。删除 command 对 `runtime_host_kind` 的分派和前端传入 PID 的信任；可暂时保留 `pid` 参数以兼容 invoke 参数，但 Manager 不使用它选择目标进程。

- [ ] **步骤 4：让安装注册表接受 RuntimeSnapshot**

新增单一写入函数：

```rust
pub fn apply_runtime_snapshot(
    config_path: &Path,
    snapshot: &RuntimeSnapshot,
) -> anyhow::Result<()> {
    let mut registry = load_install_registry()?;
    let Some(record) = registry
        .installations
        .iter_mut()
        .find(|item| same_path(&item.config_path, config_path))
    else {
        return Ok(());
    };

    record.runtime_state = snapshot.state.as_str().to_string();
    record.runtime_pid = snapshot.pid;
    record.runtime_log_path = snapshot
        .log_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    record.runtime_host_kind = "direct-process".to_string();
    record.last_error = snapshot.last_error.clone();
    save_install_registry(&registry)
}
```

给 `RuntimeLifecycleState` 增加 `as_str()`，返回与前端一致的小写字符串。替换 runtime commands 中分散的 `mark_installation_runtime_state` 调用。

- [ ] **步骤 5：让 watcher 驱动 reconcile**

`OpenClawStatusWatcher` 构造时持有 `RuntimeManager` clone。每轮先执行：

```rust
let runtime_snapshot = runtime_manager.reconcile(&config_path)?;
apply_runtime_snapshot(&config_path, &runtime_snapshot)?;
let status = resolve_installation_status_by_config_path(&config_path)?;
```

根据 `runtime_snapshot.state` 选择轮询间隔。`status_semantically_equal` 增加 `runtime_state`、`runtime_pid`、`gateway_ready` 和 `runtime_error` 比较，避免状态变化不发事件。

同时在 `OpenClawStatusSummary` 增加序列化字段：

```rust
pub gateway_ready: bool,
pub runtime_error: Option<String>,
```

`read_openclaw_status` 使用轻量 `/readyz` 探测填充 `gateway_ready`；`resolve_status_for_record` 从 `InstallationRecord.last_error` 填充 `runtime_error`，非注册安装使用 `None`。这样 Rust 字段会按现有 serde camelCase 规则成为前端的 `gatewayReady` 与 `runtimeError`。RuntimeManager 仍保存自己的 readiness 快照，用于判断首次 ready 和防止重复启动。

- [ ] **步骤 6：注册 RuntimeManager**

在 `lib.rs` 中使用同一个实例初始化 manager 和 watcher：

```rust
let runtime_manager = RuntimeManager::default();
let status_watcher = OpenClawStatusWatcher::new(runtime_manager.clone());
status_watcher.bootstrap_active_installation();

tauri::Builder::default()
    .manage(runtime_manager)
    .manage(status_watcher.clone())
```

- [ ] **步骤 7：运行 Rust 测试**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_poll_interval_tracks_lifecycle_state
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runtime_manager::tests
```

预期：全部 PASS，commands 编译通过。

- [ ] **步骤 8：提交 Tauri 集成**

```powershell
rtk git add apps/desktop/src-tauri/src/commands/post_install.rs apps/desktop/src-tauri/src/core/app_state/mod.rs apps/desktop/src-tauri/src/core/status_watcher.rs apps/desktop/src-tauri/src/core/status_events.rs apps/desktop/src-tauri/src/lib.rs
rtk git commit -m "feat: expose desktop-owned runtime state"
```

## 任务 5：更新前端运行状态交互

**文件：**
- 创建：`apps/desktop/src/openclaw/model/runtime-state.ts`
- 创建：`apps/desktop/tests/runtime-state.test.ts`
- 修改：`apps/desktop/src/openclaw/model/types.ts`
- 修改：`apps/desktop/src/openclaw/api/client.ts`
- 修改：`apps/desktop/src/openclaw/hooks/use-openclaw-installer.ts`
- 修改：`apps/desktop/src/features/dashboard/components/service-control-panel.tsx`

- [ ] **步骤 1：编写前端状态映射测试**

创建 `runtime-state.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { deriveRuntimePresentation } from '../src/openclaw/model/runtime-state';

describe('runtime presentation', () => {
  it('keeps starting state after an invoke request has returned', () => {
    expect(deriveRuntimePresentation('starting', false, null)).toEqual({
      busy: true,
      canStart: false,
      canStop: true,
      label: '服务启动中',
      tone: 'pending'
    });
  });

  it('allows retry after a failed runtime without auto-restarting', () => {
    expect(deriveRuntimePresentation('failed', false, 'Gateway 启动超时')).toEqual({
      busy: false,
      canStart: true,
      canStop: false,
      label: '启动失败',
      tone: 'error'
    });
  });

  it('keeps a live gateway non-startable when readiness is degraded', () => {
    expect(deriveRuntimePresentation('running', false, null)).toEqual({
      busy: false,
      canStart: false,
      canStop: true,
      label: '运行中，尚未就绪',
      tone: 'pending'
    });
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```powershell
rtk pnpm --dir apps/desktop test -- runtime-state.test.ts
```

预期：FAIL，提示 `runtime-state` 模块不存在。

- [ ] **步骤 3：实现严格状态类型和展示映射**

在 `types.ts` 添加：

```typescript
export type RuntimeLifecycleState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed';
```

将 `OpenClawPostInstallStatus.runtimeState` 改为该类型，并增加 `gatewayReady: boolean` 与 `runtimeError: string | null`。

创建 `runtime-state.ts`：

```typescript
import type { RuntimeLifecycleState } from './types';

export function deriveRuntimePresentation(
  state: RuntimeLifecycleState,
  gatewayReady: boolean,
  error: string | null
) {
  switch (state) {
    case 'starting':
      return { busy: true, canStart: false, canStop: true, label: '服务启动中', tone: 'pending' as const };
    case 'running':
      return gatewayReady
        ? { busy: false, canStart: false, canStop: true, label: '服务运行中', tone: 'success' as const }
        : { busy: false, canStart: false, canStop: true, label: '运行中，尚未就绪', tone: 'pending' as const };
    case 'stopping':
      return { busy: true, canStart: false, canStop: false, label: '服务停止中', tone: 'pending' as const };
    case 'failed':
      return { busy: false, canStart: true, canStop: false, label: error ? '启动失败' : '服务异常', tone: 'error' as const };
    case 'stopped':
      return { busy: false, canStart: true, canStop: false, label: '服务已停止', tone: 'muted' as const };
  }
}
```

- [ ] **步骤 4：调整 API 和 hook 的完成语义**

`launchOpenClawRuntime` 返回后只表示进程创建已接受。`handleLaunchRuntime` 不再立即把 loading 当成 ready；invoke 完成后清除请求 loading，持续状态由 `status.runtimeState === 'starting'` 决定。状态事件到达 `running/failed` 后 UI 自动更新。

stop/restart 使用相同规则。所有 mutation 完成后仍调用一次 `refreshStatusSnapshot` 作为事件不可用时的回退。

- [ ] **步骤 5：更新 ServiceControlPanel**

调用 `deriveRuntimePresentation(status.runtimeState, status.gatewayReady, status.runtimeError)` 决定按钮与文本：

- `starting`：显示启动中，允许停止，不允许重复启动；
- `running + gatewayReady=true`：显示网页端、重启、停止；
- `running + gatewayReady=false`：显示“运行中，尚未就绪”，允许停止和重启，不允许再次启动或打开网页端；
- `stopping`：全部操作禁用；
- `failed`：显示 `runtimeError` 和“重新启动”；
- `stopped`：显示“启动网关服务”。

保留现有稳定尺寸，状态文本变化不得引发布局跳动。

- [ ] **步骤 6：运行前端测试和类型检查**

```powershell
rtk pnpm --dir apps/desktop test -- runtime-state.test.ts
rtk pnpm --dir apps/desktop typecheck
```

预期：Vitest PASS，TypeScript 无错误。

- [ ] **步骤 7：提交前端状态交互**

```powershell
rtk git add apps/desktop/src/openclaw/model/runtime-state.ts apps/desktop/tests/runtime-state.test.ts apps/desktop/src/openclaw/model/types.ts apps/desktop/src/openclaw/api/client.ts apps/desktop/src/openclaw/hooks/use-openclaw-installer.ts apps/desktop/src/features/dashboard/components/service-control-panel.tsx
rtk git commit -m "feat: show durable openclaw runtime states"
```

## 任务 6：实现应用退出清理和旧 Host 迁移

**文件：**
- 修改：`apps/desktop/src-tauri/src/core/runtime_manager.rs`
- 修改：`apps/desktop/src-tauri/src/core/uninstall.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`
- 删除：`apps/desktop/src-tauri/src/core/runtime_host.rs`
- 删除：`apps/desktop/src-tauri/src/bin/openclaw-host.rs`
- 创建：`apps/desktop/tests/no-runtime-host-daemon.test.ts`

- [ ] **步骤 1：编写 shutdown 和旧 Host 清理测试**

在 `runtime_manager.rs` 测试模块增加：

```rust
#[test]
fn shutdown_stops_only_the_verified_managed_process() {
    let adapter = FakeAdapter::ready_after_launch(7001);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));
    manager.start(&sample_config_path()).unwrap();

    manager.shutdown().unwrap();

    assert_eq!(adapter.stopped_pids(), vec![7001]);
    assert_eq!(manager.snapshot().state, RuntimeLifecycleState::Stopped);
}

#[test]
fn shutdown_does_not_stop_an_unverified_pid() {
    let adapter = FakeAdapter::with_unrelated_port_owner(9001);
    let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

    manager.shutdown().unwrap();

    assert!(adapter.stopped_pids().is_empty());
}
```

- [ ] **步骤 2：创建 daemon 回归防护测试**

创建 `no-runtime-host-daemon.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tauriRoot = join(process.cwd(), 'src-tauri', 'src');

describe('desktop-owned runtime architecture', () => {
  it('does not ship a persistent runtime host daemon', () => {
    expect(existsSync(join(tauriRoot, 'bin', 'openclaw-host.rs'))).toBe(false);
    expect(existsSync(join(tauriRoot, 'core', 'runtime_host.rs'))).toBe(false);
  });

  it('does not reference legacy file IPC or external helper mode', () => {
    const source = [
      join(tauriRoot, 'lib.rs'),
      join(tauriRoot, 'commands', 'post_install.rs'),
      join(tauriRoot, 'core', 'runtime_manager.rs')
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(source).not.toMatch(/external-helper|spawn-daemon|command\.json|result\.json/);
  });
});
```

- [ ] **步骤 3：运行测试确认失败**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml shutdown_
rtk pnpm --dir apps/desktop test -- no-runtime-host-daemon.test.ts
```

预期：Rust shutdown 方法尚未完成，前端回归测试因旧文件仍存在而 FAIL。

- [ ] **步骤 4：接入真正退出事件**

将当前 `tauri::Builder::default()` 绑定改为 `let app = tauri::Builder::default()`，保留中间已有的 manage、window event、setup、plugin 和 invoke handler 调用，并把链尾替换为：

```rust
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

app.run(move |_app_handle, event| {
    if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
        if let Err(error) = runtime_manager.shutdown() {
            eprintln!("stop OpenClaw during desktop exit failed: {error:#}");
        }
    }
});
```

实现时保留当前完整 invoke handler 列表和 setup/tray 逻辑。主窗口 `CloseRequested` 仍隐藏窗口，因此不会触发 shutdown；托盘“退出应用”调用 `app.exit(0)`，进入统一 ExitRequested 路径。

- [ ] **步骤 5：让卸载复用 RuntimeManager**

`execute_uninstall_command` 注入 `RuntimeManager`，在删除文件前调用 `manager.stop(configPath)`。删除 `core/uninstall.rs` 对 `runtime_host_kind` 和 helper fallback 的依赖。若身份验证失败，卸载必须中止并保留文件。

- [ ] **步骤 6：迁移旧状态并删除 helper**

在 RuntimeManager bootstrap/reconcile 中：

1. 读取旧 `.runtime-host/daemon.pid`；
2. 仅当 `identity(pid)` 的 executable filename 为 `openclaw-host.exe` 时停止旧 daemon；
3. 不停止端口所有者 Gateway；
4. 删除 `.runtime-host` 下 `command.json`、`result.json`、`state.json` 和 `daemon.pid`；
5. 将安装注册表 `runtimeHostKind` 写为 `direct-process`；
6. 对仍运行的 Gateway 执行新身份验证并接管。

随后删除 `runtime_host.rs` 与 `openclaw-host.rs`，并从 `core/mod.rs` 删除 `pub mod runtime_host;`。

- [ ] **步骤 7：运行退出和架构回归测试**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml shutdown_
rtk pnpm --dir apps/desktop test -- no-runtime-host-daemon.test.ts
```

预期：全部 PASS。

- [ ] **步骤 8：提交退出与迁移**

```powershell
rtk git add apps/desktop/src-tauri/src/core/runtime_manager.rs apps/desktop/src-tauri/src/core/uninstall.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/core/mod.rs apps/desktop/tests/no-runtime-host-daemon.test.ts
rtk git add -u apps/desktop/src-tauri/src/core/runtime_host.rs apps/desktop/src-tauri/src/bin/openclaw-host.rs
rtk git commit -m "refactor: remove persistent runtime host daemon"
```

## 任务 7：全量验证和 Windows 手工验收

**文件：**
- 修改：`docs/superpowers/plans/2026-07-16-desktop-owned-openclaw-runtime.md`（执行时勾选已完成步骤）

- [ ] **步骤 1：运行 Rust 全量测试**

```powershell
rtk cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

预期：所有 library、main 和 bin tests PASS，不再构建 `openclaw-host` target。

- [ ] **步骤 2：运行桌面前端全量测试和类型检查**

```powershell
rtk pnpm --dir apps/desktop test
rtk pnpm --dir apps/desktop typecheck
```

预期：所有 Vitest 测试 PASS，TypeScript 无错误。

- [ ] **步骤 3：构建 Release 应用**

```powershell
rtk pnpm --dir apps/desktop build
```

预期：Tauri release 和 NSIS 构建成功，应用目录不要求存在 `openclaw-host.exe`。

- [ ] **步骤 4：验证启动与页面刷新**

1. 确认 `18789` 未监听。
2. 点击“启动网关服务”。
3. 确认 UI 快速进入“服务启动中”。
4. 在启动中刷新 WebView，确认 PID 不变且没有第二个 Node Gateway。
5. 等待“服务运行中”，确认 `127.0.0.1:18789` 的端口所有者等于 UI 显示 PID。

- [ ] **步骤 5：验证窗口和退出语义**

1. 点击主窗口关闭按钮，确认窗口隐藏到托盘且 Gateway 继续运行。
2. 从托盘重新打开窗口，确认仍显示运行中。
3. 从托盘选择“退出应用”，确认 Gateway 在退出窗口内停止。

- [ ] **步骤 6：验证崩溃恢复和失败语义**

1. 运行 Gateway 后从任务管理器强制结束桌面应用。
2. 重新打开桌面应用，确认验证并接管同一 PID。
3. 强制结束 Gateway，确认 UI 进入 failed，显示错误且不自动启动新 PID。
4. 点击重新启动，确认进入新的 starting 并最终 running。

- [ ] **步骤 7：验证端口冲突保护**

1. 停止 OpenClaw。
2. 使用无关本地进程监听 `127.0.0.1:18789`。
3. 点击启动，确认显示端口冲突。
4. 确认无关进程仍存活且没有被 taskkill。

- [ ] **步骤 8：记录最终验证并提交计划状态**

在计划末尾追加实际执行的测试命令、通过结果和手工验收时间，然后提交：

```powershell
rtk git add docs/superpowers/plans/2026-07-16-desktop-owned-openclaw-runtime.md
rtk git commit -m "docs: record runtime manager verification"
```
