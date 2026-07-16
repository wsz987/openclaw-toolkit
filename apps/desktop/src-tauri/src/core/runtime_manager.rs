use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::os::windows::fs::OpenOptionsExt;

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::core::{
    openclaw_config::{read_openclaw_runtime_context, OpenClawRuntimeContext},
    runtime_process::{
        identity_matches_context, RuntimeProcessAdapter, SystemRuntimeProcessAdapter,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeLifecycleState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Failed,
}

impl RuntimeLifecycleState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Stopping => "stopping",
            Self::Failed => "failed",
        }
    }
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

const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(200);

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
        self.snapshot
            .lock()
            .expect("runtime snapshot poisoned")
            .clone()
    }

    pub fn start(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let _operation = self
            .operation_lock
            .lock()
            .expect("runtime operation lock poisoned");
        self.start_locked(config_path)
    }

    pub fn stop(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let _operation = self
            .operation_lock
            .lock()
            .expect("runtime operation lock poisoned");
        self.stop_locked(config_path)
    }

    pub fn restart(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let _operation = self
            .operation_lock
            .lock()
            .expect("runtime operation lock poisoned");
        self.stop_locked(config_path)?;
        self.start_locked(config_path)
    }

    pub fn reconcile(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let _operation = self
            .operation_lock
            .lock()
            .expect("runtime operation lock poisoned");
        let context = read_openclaw_runtime_context(config_path)?;
        self.reconcile_context_locked(&context)
    }

    pub fn shutdown(&self) -> anyhow::Result<RuntimeSnapshot> {
        let _operation = self
            .operation_lock
            .lock()
            .expect("runtime operation lock poisoned");
        let current = self.snapshot();
        let Some(config_path) = current.config_path.as_deref() else {
            return Ok(current);
        };

        if current.state == RuntimeLifecycleState::Stopped {
            return Ok(current);
        }
        self.stop_locked(&config_path)
    }

    fn start_locked(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let context = read_openclaw_runtime_context(config_path)?;
        let current = self.snapshot();
        match current.state {
            RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running
                if current.config_path.as_deref() == Some(config_path) =>
            {
                return Ok(current);
            }
            RuntimeLifecycleState::Stopping => {
                anyhow::bail!("OpenClaw 正在停止，请稍后重试");
            }
            RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running => {
                anyhow::bail!("已有另一个 OpenClaw 实例正在运行");
            }
            RuntimeLifecycleState::Stopped | RuntimeLifecycleState::Failed => {}
        }

        let _start_lock = acquire_start_lock(&context)?;
        let official_status = self.adapter.official_status(&context)?;
        if official_status.has_service_conflict() {
            anyhow::bail!("检测到官方 Gateway 服务，请先停用后再启动桌面托管模式");
        }

        let reconciled = self.reconcile_context_locked(&context)?;
        if matches!(
            reconciled.state,
            RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running
        ) && reconciled.config_path.as_deref() == Some(config_path)
        {
            return Ok(reconciled);
        }

        if let Some(pid) = self.adapter.port_owner(&context.gateway_url) {
            anyhow::bail!(
                "Gateway 端口 {} 已被未经验证的进程占用（PID {}）",
                context.gateway_url,
                pid
            );
        }

        let launch = self.adapter.launch(&context)?;
        let snapshot = RuntimeSnapshot {
            state: RuntimeLifecycleState::Starting,
            config_path: Some(config_path.to_path_buf()),
            pid: Some(launch.pid),
            log_path: Some(launch.log_path),
            started_at: Some(Utc::now()),
            ready_at: None,
            last_error: None,
            adopted: false,
            gateway_live: false,
            gateway_ready: false,
        };
        self.replace_snapshot(snapshot.clone());
        Ok(snapshot)
    }

    fn stop_locked(&self, config_path: &Path) -> anyhow::Result<RuntimeSnapshot> {
        let context = read_openclaw_runtime_context(config_path)?;
        let current = self.reconcile_context_locked(&context)?;
        if current.state == RuntimeLifecycleState::Stopped {
            return Ok(current);
        }
        if current.config_path.as_deref() != Some(config_path) {
            anyhow::bail!("当前 OpenClaw 实例不属于所选安装");
        }

        let mut stopping = current.clone();
        stopping.state = RuntimeLifecycleState::Stopping;
        stopping.last_error = None;
        self.replace_snapshot(stopping);

        if let Err(error) = self.adapter.request_official_stop(&context) {
            let failed =
                self.failed_snapshot(current, format!("请求 OpenClaw 正常停止失败：{error:#}"));
            self.replace_snapshot(failed);
            return Err(error);
        }

        if self.wait_for_stop(&context, current.pid) {
            let stopped = stopped_snapshot(config_path);
            self.replace_snapshot(stopped.clone());
            return Ok(stopped);
        }

        if let Some(pid) = current.pid.filter(|_| !current.adopted) {
            if self.identity_matches(&context, pid) {
                self.adapter.force_stop_tree(pid)?;
                if self.wait_for_stop(&context, Some(pid)) {
                    let stopped = stopped_snapshot(config_path);
                    self.replace_snapshot(stopped.clone());
                    return Ok(stopped);
                }
            }
        }

        let error = anyhow::anyhow!("OpenClaw 未能在限定时间内停止");
        let failed = self.failed_snapshot(current, error.to_string());
        self.replace_snapshot(failed);
        Err(error)
    }

    fn reconcile_context_locked(
        &self,
        context: &OpenClawRuntimeContext,
    ) -> anyhow::Result<RuntimeSnapshot> {
        self.migrate_legacy_runtime_host(context)?;
        let current = self.snapshot();
        let port_owner = self.adapter.port_owner(&context.gateway_url);

        if current.pid.is_none() {
            return self.reconcile_untracked_port_owner(current, context, port_owner);
        }

        if current.config_path.as_deref() != Some(Path::new(&context.config_path)) {
            return Ok(current);
        }

        let pid = current.pid.expect("checked above");
        let observation = RuntimeObservation {
            process_alive: self.adapter.is_alive(pid),
            gateway_live: self.adapter.gateway_liveness(&context.gateway_url),
            gateway_ready: self.adapter.gateway_readiness(&context.gateway_url),
            port_owner_matches: port_owner == Some(pid),
            startup_timed_out: current.state == RuntimeLifecycleState::Starting
                && current.started_at.is_some_and(|started| {
                    Utc::now()
                        .signed_duration_since(started)
                        .to_std()
                        .is_ok_and(|elapsed| elapsed >= STARTUP_TIMEOUT)
                }),
        };

        if observation.startup_timed_out {
            return self.fail_timed_out_start(current, context, observation);
        }

        let next_state = reduce_observation(current.state, observation);
        let mut next = current.clone();
        next.state = next_state;
        next.gateway_live = observation.gateway_live;
        next.gateway_ready = observation.gateway_ready;
        if next_state == RuntimeLifecycleState::Running
            && current.state != RuntimeLifecycleState::Running
        {
            next.ready_at = Some(Utc::now());
        }
        if next_state == RuntimeLifecycleState::Failed {
            next.last_error = Some(if !observation.process_alive {
                "OpenClaw Gateway 进程已退出".to_string()
            } else {
                "Gateway 端口所有权已丢失".to_string()
            });
        }
        self.replace_snapshot(next.clone());
        Ok(next)
    }

    fn reconcile_untracked_port_owner(
        &self,
        current: RuntimeSnapshot,
        context: &OpenClawRuntimeContext,
        port_owner: Option<u32>,
    ) -> anyhow::Result<RuntimeSnapshot> {
        let Some(pid) = port_owner else {
            return Ok(current);
        };

        if !self.adapter.is_alive(pid) || !self.identity_matches(context, pid) {
            let failed = self.failed_snapshot(
                current,
                format!(
                    "Gateway 端口 {} 被其他进程占用（PID {pid}）",
                    context.gateway_url
                ),
            );
            self.replace_snapshot(failed.clone());
            return Ok(failed);
        }

        let gateway_live = self.adapter.gateway_liveness(&context.gateway_url);
        let gateway_ready = self.adapter.gateway_readiness(&context.gateway_url);
        let snapshot = RuntimeSnapshot {
            state: if gateway_ready {
                RuntimeLifecycleState::Running
            } else {
                RuntimeLifecycleState::Starting
            },
            config_path: Some(PathBuf::from(&context.config_path)),
            pid: Some(pid),
            log_path: Some(PathBuf::from(&context.runtime_log_path)),
            started_at: Some(Utc::now()),
            ready_at: gateway_ready.then(Utc::now),
            last_error: None,
            adopted: true,
            gateway_live,
            gateway_ready,
        };
        self.replace_snapshot(snapshot.clone());
        Ok(snapshot)
    }

    fn fail_timed_out_start(
        &self,
        current: RuntimeSnapshot,
        context: &OpenClawRuntimeContext,
        observation: RuntimeObservation,
    ) -> anyhow::Result<RuntimeSnapshot> {
        let pid = current.pid.expect("timed out start has pid");
        let mut error = "Gateway 在 60 秒内未通过就绪检查".to_string();

        if let Err(stop_error) = self.adapter.request_official_stop(context) {
            error.push_str(&format!("；官方停止失败：{stop_error:#}"));
        }

        if self.adapter.is_alive(pid) && !current.adopted && self.identity_matches(context, pid) {
            if let Err(stop_error) = self.adapter.force_stop_tree(pid) {
                error.push_str(&format!("；强制停止失败：{stop_error:#}"));
            }
        }

        let mut failed = self.failed_snapshot(current, error);
        failed.gateway_live = observation.gateway_live;
        failed.gateway_ready = observation.gateway_ready;
        self.replace_snapshot(failed.clone());
        Ok(failed)
    }

    fn wait_for_stop(&self, context: &OpenClawRuntimeContext, pid: Option<u32>) -> bool {
        let checks = (STOP_TIMEOUT.as_millis() / STOP_POLL_INTERVAL.as_millis()) as usize;
        for _ in 0..=checks {
            let process_alive = pid.is_some_and(|value| self.adapter.is_alive(value));
            let port_occupied = self.adapter.port_owner(&context.gateway_url).is_some();
            if !process_alive && !port_occupied {
                return true;
            }
            thread::sleep(STOP_POLL_INTERVAL);
        }
        false
    }

    fn identity_matches(&self, context: &OpenClawRuntimeContext, pid: u32) -> bool {
        self.adapter
            .identity(pid)
            .map(|identity| identity_matches_context(&identity, context))
            .unwrap_or(false)
    }

    fn migrate_legacy_runtime_host(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<()> {
        let host_dir = PathBuf::from(&context.openclaw_dir).join(".runtime-host");
        let daemon_pid_path = host_dir.join("daemon.pid");
        if !host_dir.exists() {
            return Ok(());
        }

        let daemon_pid = fs::read_to_string(&daemon_pid_path)
            .ok()
            .and_then(|value| value.trim().parse::<u32>().ok());
        if let Some(pid) = daemon_pid {
            let is_legacy_host = self
                .adapter
                .identity(pid)
                .ok()
                .and_then(|identity| {
                    identity
                        .executable_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| {
                            name.eq_ignore_ascii_case("openclaw-host.exe")
                                || name.eq_ignore_ascii_case("openclaw-host")
                        })
                })
                .unwrap_or(false);
            if !is_legacy_host {
                return Ok(());
            }

            self.adapter
                .force_stop_tree(pid)
                .with_context(|| format!("stop legacy openclaw-host daemon {pid}"))?;
        }

        for file_name in ["command.json", "result.json", "state.json", "daemon.pid"] {
            let _ = fs::remove_file(host_dir.join(file_name));
        }
        let _ = fs::remove_dir(&host_dir);
        Ok(())
    }

    fn failed_snapshot(&self, mut snapshot: RuntimeSnapshot, error: String) -> RuntimeSnapshot {
        snapshot.state = RuntimeLifecycleState::Failed;
        snapshot.last_error = Some(error);
        snapshot
    }

    fn replace_snapshot(&self, snapshot: RuntimeSnapshot) {
        *self.snapshot.lock().expect("runtime snapshot poisoned") = snapshot;
    }
}

fn stopped_snapshot(config_path: &Path) -> RuntimeSnapshot {
    RuntimeSnapshot {
        config_path: Some(config_path.to_path_buf()),
        ..RuntimeSnapshot::default()
    }
}

fn acquire_start_lock(context: &OpenClawRuntimeContext) -> anyhow::Result<File> {
    let lock_path = PathBuf::from(&context.openclaw_dir).join(".runtime-control.lock");
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(target_os = "windows")]
    options.share_mode(0);
    options.open(&lock_path).map_err(|error| {
        anyhow::anyhow!(
            "获取 OpenClaw 启动锁失败：{} - {error}",
            lock_path.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{HashMap, HashSet},
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, AtomicUsize, Ordering},
            Arc, Mutex,
        },
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{reduce_observation, RuntimeLifecycleState, RuntimeManager, RuntimeObservation};
    use crate::core::{
        openclaw_config::OpenClawRuntimeContext,
        runtime_process::{
            ManagedProcessIdentity, OfficialGatewayServiceStatus, OfficialGatewayStatus,
            RuntimeLaunch, RuntimeProcessAdapter,
        },
    };

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

    #[test]
    fn repeated_start_launches_only_one_process() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::ready_after_launch(7001);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

        let first = manager.start(&fixture.config_path).unwrap();
        let second = manager.start(&fixture.config_path).unwrap();

        assert_eq!(first.pid, Some(7001));
        assert_eq!(second.pid, Some(7001));
        assert_eq!(adapter.launch_count(), 1);
    }

    #[test]
    fn unrelated_port_owner_is_never_stopped() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::with_unrelated_port_owner(9001);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

        let error = manager.start(&fixture.config_path).unwrap_err();

        assert!(error.to_string().contains("18789"));
        assert_eq!(adapter.stop_count(), 0);
    }

    #[test]
    fn installed_official_gateway_service_blocks_foreground_launch() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::with_official_service(true, true, true);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

        let error = manager.start(&fixture.config_path).unwrap_err();

        assert!(error.to_string().contains("Gateway 服务"));
        assert_eq!(adapter.launch_count(), 0);
        assert_eq!(adapter.stop_count(), 0);
    }

    #[test]
    fn process_exit_moves_to_failed_without_relaunch() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::ready_after_launch(7001);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));
        manager.start(&fixture.config_path).unwrap();
        adapter.mark_exited(7001);

        let snapshot = manager.reconcile(&fixture.config_path).unwrap();

        assert_eq!(snapshot.state, RuntimeLifecycleState::Failed);
        assert_eq!(adapter.launch_count(), 1);
    }

    #[test]
    fn reconcile_adopts_verified_gateway_after_desktop_restart() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::with_verified_running_gateway(8123, &fixture.context);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter));

        let snapshot = manager.reconcile(&fixture.config_path).unwrap();

        assert_eq!(snapshot.state, RuntimeLifecycleState::Running);
        assert_eq!(snapshot.pid, Some(8123));
        assert!(snapshot.adopted);
    }

    #[test]
    fn shutdown_stops_only_the_verified_managed_process() {
        let fixture = RuntimeFixture::new();
        let adapter = FakeAdapter::ready_after_launch(7001);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));
        manager.start(&fixture.config_path).unwrap();

        manager.shutdown().unwrap();

        assert_eq!(adapter.stop_count(), 1);
        assert_eq!(manager.snapshot().state, RuntimeLifecycleState::Stopped);
    }

    #[test]
    fn shutdown_does_not_stop_an_unverified_pid() {
        let adapter = FakeAdapter::with_unrelated_port_owner(9001);
        let manager = RuntimeManager::with_adapter(Arc::new(adapter.clone()));

        manager.shutdown().unwrap();

        assert_eq!(adapter.stop_count(), 0);
    }

    struct RuntimeFixture {
        config_path: PathBuf,
        context: OpenClawRuntimeContext,
    }

    impl RuntimeFixture {
        fn new() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let openclaw_dir = std::env::temp_dir().join(format!("openclaw-runtime-{suffix}"));
            let node_dir = openclaw_dir.join("node");
            let config_path = openclaw_dir.join("openclaw.json");
            fs::create_dir_all(&node_dir).unwrap();
            fs::write(&config_path, r#"{"gateway":{"port":18789}}"#).unwrap();
            fs::write(
                openclaw_dir.join("installed-manifest.json"),
                serde_json::json!({
                    "toolkitVersion": "test",
                    "openclawVersion": "test",
                    "nodeVersion": "test",
                    "installMode": "offline",
                    "installedAt": "2026-01-01T00:00:00Z",
                    "openclawDir": openclaw_dir,
                    "nodeDir": node_dir,
                    "configPath": config_path
                })
                .to_string(),
            )
            .unwrap();

            Self {
                context: OpenClawRuntimeContext {
                    openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
                    node_dir: node_dir.to_string_lossy().to_string(),
                    config_path: config_path.to_string_lossy().to_string(),
                    gateway_url: "http://127.0.0.1:18789".to_string(),
                    runtime_log_path: openclaw_dir
                        .join("logs")
                        .join("gateway-runtime.log")
                        .to_string_lossy()
                        .to_string(),
                },
                config_path,
            }
        }
    }

    #[derive(Clone)]
    struct FakeAdapter {
        state: Arc<FakeAdapterState>,
    }

    struct FakeAdapterState {
        launch_pid: u32,
        launch_count: AtomicUsize,
        stop_count: AtomicUsize,
        alive_pids: Mutex<HashSet<u32>>,
        port_owner: Mutex<Option<u32>>,
        identities: Mutex<HashMap<u32, ManagedProcessIdentity>>,
        official_status: Mutex<OfficialGatewayStatus>,
        gateway_live: AtomicBool,
        gateway_ready: AtomicBool,
    }

    impl FakeAdapter {
        fn ready_after_launch(pid: u32) -> Self {
            Self::new(pid, None, OfficialGatewayStatus::default(), true, true)
        }

        fn with_unrelated_port_owner(pid: u32) -> Self {
            let adapter = Self::new(
                pid,
                Some(pid),
                OfficialGatewayStatus::default(),
                false,
                false,
            );
            adapter.state.identities.lock().unwrap().insert(
                pid,
                ManagedProcessIdentity {
                    pid,
                    executable_path: PathBuf::from(r"C:\Other\server.exe"),
                    command_line: "server.exe --port 18789".to_string(),
                },
            );
            adapter
        }

        fn with_official_service(installed: bool, loaded: bool, running: bool) -> Self {
            Self::new(
                7001,
                None,
                OfficialGatewayStatus {
                    service: OfficialGatewayServiceStatus {
                        installed,
                        loaded,
                        running,
                        runtime: None,
                    },
                    extra_services: Vec::new(),
                },
                false,
                false,
            )
        }

        fn with_verified_running_gateway(pid: u32, context: &OpenClawRuntimeContext) -> Self {
            let adapter = Self::new(pid, Some(pid), OfficialGatewayStatus::default(), true, true);
            adapter.state.alive_pids.lock().unwrap().insert(pid);
            adapter.state.identities.lock().unwrap().insert(
                pid,
                ManagedProcessIdentity {
                    pid,
                    executable_path: PathBuf::from(&context.node_dir).join("node.exe"),
                    command_line: format!(
                        "node.exe {} gateway run",
                        PathBuf::from(&context.openclaw_dir)
                            .join("package")
                            .join("openclaw.mjs")
                            .display()
                    ),
                },
            );
            adapter
        }

        fn new(
            launch_pid: u32,
            port_owner: Option<u32>,
            official_status: OfficialGatewayStatus,
            gateway_live: bool,
            gateway_ready: bool,
        ) -> Self {
            Self {
                state: Arc::new(FakeAdapterState {
                    launch_pid,
                    launch_count: AtomicUsize::new(0),
                    stop_count: AtomicUsize::new(0),
                    alive_pids: Mutex::new(HashSet::new()),
                    port_owner: Mutex::new(port_owner),
                    identities: Mutex::new(HashMap::new()),
                    official_status: Mutex::new(official_status),
                    gateway_live: AtomicBool::new(gateway_live),
                    gateway_ready: AtomicBool::new(gateway_ready),
                }),
            }
        }

        fn launch_count(&self) -> usize {
            self.state.launch_count.load(Ordering::SeqCst)
        }

        fn stop_count(&self) -> usize {
            self.state.stop_count.load(Ordering::SeqCst)
        }

        fn mark_exited(&self, pid: u32) {
            self.state.alive_pids.lock().unwrap().remove(&pid);
            let mut port_owner = self.state.port_owner.lock().unwrap();
            if *port_owner == Some(pid) {
                *port_owner = None;
            }
        }
    }

    impl RuntimeProcessAdapter for FakeAdapter {
        fn launch(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<RuntimeLaunch> {
            let pid = self.state.launch_pid;
            self.state.launch_count.fetch_add(1, Ordering::SeqCst);
            self.state.alive_pids.lock().unwrap().insert(pid);
            *self.state.port_owner.lock().unwrap() = Some(pid);
            self.state.identities.lock().unwrap().insert(
                pid,
                ManagedProcessIdentity {
                    pid,
                    executable_path: PathBuf::from(&context.node_dir).join("node.exe"),
                    command_line: format!(
                        "node.exe {} gateway run",
                        PathBuf::from(&context.openclaw_dir)
                            .join("package")
                            .join("openclaw.mjs")
                            .display()
                    ),
                },
            );

            Ok(RuntimeLaunch {
                pid,
                log_path: PathBuf::from(&context.runtime_log_path),
            })
        }

        fn is_alive(&self, pid: u32) -> bool {
            self.state.alive_pids.lock().unwrap().contains(&pid)
        }

        fn port_owner(&self, _gateway_url: &str) -> Option<u32> {
            *self.state.port_owner.lock().unwrap()
        }

        fn gateway_liveness(&self, _gateway_url: &str) -> bool {
            self.state.gateway_live.load(Ordering::SeqCst)
        }

        fn gateway_readiness(&self, _gateway_url: &str) -> bool {
            self.state.gateway_ready.load(Ordering::SeqCst)
        }

        fn official_status(
            &self,
            _context: &OpenClawRuntimeContext,
        ) -> anyhow::Result<OfficialGatewayStatus> {
            Ok(self.state.official_status.lock().unwrap().clone())
        }

        fn request_official_stop(&self, _context: &OpenClawRuntimeContext) -> anyhow::Result<()> {
            self.state.stop_count.fetch_add(1, Ordering::SeqCst);
            let pid = *self.state.port_owner.lock().unwrap();
            if let Some(pid) = pid {
                self.mark_exited(pid);
            }
            Ok(())
        }

        fn identity(&self, pid: u32) -> anyhow::Result<ManagedProcessIdentity> {
            self.state
                .identities
                .lock()
                .unwrap()
                .get(&pid)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("missing fake identity for {pid}"))
        }

        fn force_stop_tree(&self, pid: u32) -> anyhow::Result<()> {
            self.state.stop_count.fetch_add(1, Ordering::SeqCst);
            self.mark_exited(pid);
            Ok(())
        }
    }
}
