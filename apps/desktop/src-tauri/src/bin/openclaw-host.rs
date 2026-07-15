use std::{
    env, fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    process::{self, Stdio},
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;
use openclaw_toolkit_desktop_lib::core::{
    background_process::{background_command, detach_from_parent_process, suppress_console_window},
    openclaw_config::{
        probe_gateway_runtime, read_openclaw_runtime_context, runtime_pid_for_gateway_url,
        OpenClawRuntimeContext,
    },
    process::{launch_managed_openclaw_from_context, stop_managed_openclaw},
    runtime_host::RUNTIME_HOST_KIND_EXTERNAL_HELPER,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

const HOST_DIR_NAME: &str = ".runtime-host";
const DAEMON_POLL_INTERVAL_MS: u64 = 800;
const CLIENT_WAIT_TIMEOUT_MS: u64 = 20_000;
const SPAWN_READY_TIMEOUT_MS: u64 = 30_000;
const RUNTIME_RECONCILIATION_INTERVAL: Duration = Duration::from_secs(5);
const STALE_COMMAND_TIMEOUT_SECS: i64 = 30;
const DAEMON_LAUNCH_SENTINEL: &str = "OPENCLAW_HOST_DAEMONIZED";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchResponse {
    pid: u32,
    log_path: String,
    runtime_host_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopResponse {
    stopped: bool,
    runtime_host_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    running: bool,
    pid: Option<u32>,
    log_path: Option<String>,
    runtime_host_kind: String,
    daemon_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonState {
    config_path: String,
    runtime_host_kind: String,
    daemon_pid: u32,
    daemon_started_at: String,
    daemon_heartbeat_at: String,
    runtime_state: String,
    runtime_pid: Option<u32>,
    runtime_log_path: Option<String>,
    last_error: Option<String>,
    last_command_id: Option<String>,
    last_command_completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostCommandEnvelope {
    command_id: String,
    kind: HostCommandKind,
    requested_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum HostCommandKind {
    Start,
    Stop,
    Restart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostCommandResult {
    command_id: String,
    completed_at: String,
    success: bool,
    error: Option<String>,
    state: DaemonState,
}

#[derive(Debug, Clone)]
struct HostPaths {
    config_path: PathBuf,
    host_dir: PathBuf,
    state_path: PathBuf,
    command_path: PathBuf,
    result_path: PathBuf,
    daemon_pid_path: PathBuf,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{}", render_error(&error));
        process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        anyhow::bail!("usage: openclaw-host <start|stop|restart|status|daemon> [options]");
    };
    let remaining_args = args.collect::<Vec<_>>();

    match command.as_str() {
        "start" => {
            let config_path = parse_named_arg(remaining_args, "--config")?;
            let response = handle_client_command(&config_path, HostCommandKind::Start)?;
            write_json(&LaunchResponse {
                pid: response.state.runtime_pid.unwrap_or_default(),
                log_path: response.state.runtime_log_path.clone().unwrap_or_default(),
                runtime_host_kind: response.state.runtime_host_kind.clone(),
            })?;
        }
        "stop" => {
            let config_path = if let Ok(value) = parse_named_arg(remaining_args.clone(), "--config")
            {
                value
            } else {
                let pid = parse_named_arg(remaining_args, "--pid")?
                    .parse::<u32>()
                    .context("parse --pid as u32")?;
                let guessed = try_resolve_config_from_pid(pid).with_context(|| {
                    format!("cannot infer config from pid {pid}, please use --config")
                })?;
                guessed
            };
            let response = handle_client_command(&config_path, HostCommandKind::Stop)?;
            write_json(&StopResponse {
                stopped: response.success,
                runtime_host_kind: response.state.runtime_host_kind.clone(),
            })?;
        }
        "restart" => {
            let config_path = parse_named_arg(remaining_args, "--config")?;
            let response = handle_client_command(&config_path, HostCommandKind::Restart)?;
            write_json(&LaunchResponse {
                pid: response.state.runtime_pid.unwrap_or_default(),
                log_path: response.state.runtime_log_path.clone().unwrap_or_default(),
                runtime_host_kind: response.state.runtime_host_kind.clone(),
            })?;
        }
        "status" => {
            let config_path = parse_named_arg(remaining_args, "--config")?;
            let paths = host_paths_from_config(&PathBuf::from(&config_path));
            let state = read_state_if_present(&paths)?;
            let daemon_running = state
                .as_ref()
                .and_then(|item| process_is_running(item.daemon_pid).then_some(()))
                .is_some();
            let running = state
                .as_ref()
                .and_then(|item| item.runtime_pid)
                .is_some_and(process_is_running);
            write_json(&StatusResponse {
                running,
                pid: state.as_ref().and_then(|item| item.runtime_pid),
                log_path: state
                    .as_ref()
                    .and_then(|item| item.runtime_log_path.clone()),
                runtime_host_kind: RUNTIME_HOST_KIND_EXTERNAL_HELPER.to_string(),
                daemon_running,
            })?;
        }
        "daemon" => {
            let config_path = parse_named_arg(remaining_args, "--config")?;
            run_daemon(PathBuf::from(config_path))?;
        }
        "spawn-daemon" => {
            let config_path = parse_named_arg(remaining_args, "--config")?;
            spawn_detached_daemon(PathBuf::from(config_path))?;
        }
        other => anyhow::bail!("unsupported command: {other}"),
    }

    Ok(())
}

fn handle_client_command(
    config_path: &str,
    kind: HostCommandKind,
) -> anyhow::Result<HostCommandResult> {
    let config_path = PathBuf::from(config_path);
    let paths = host_paths_from_config(&config_path);
    fs::create_dir_all(&paths.host_dir)
        .with_context(|| format!("create runtime host dir {}", paths.host_dir.display()))?;
    ensure_daemon_running(&paths)?;
    submit_command_and_wait(&paths, kind)
}

fn ensure_daemon_running(paths: &HostPaths) -> anyhow::Result<()> {
    if let Some(state) = read_state_if_present(paths)? {
        if process_is_running(state.daemon_pid) {
            return Ok(());
        }
    }

    let _ = fs::remove_file(&paths.result_path);
    let _ = fs::remove_file(&paths.command_path);
    let _ = fs::remove_file(&paths.daemon_pid_path);

    let current_exe = env::current_exe().context("resolve openclaw-host path")?;
    let mut command = background_command(current_exe);
    suppress_console_window(&mut command);
    command
        .arg("spawn-daemon")
        .arg("--config")
        .arg(&paths.config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command.spawn().with_context(|| {
        format!(
            "spawn runtime host daemon for {}",
            paths.config_path.display()
        )
    })?;

    let started = Instant::now();
    while started.elapsed() < Duration::from_millis(SPAWN_READY_TIMEOUT_MS) {
        if let Some(state) = read_state_if_present(paths)? {
            if state
                .config_path
                .eq_ignore_ascii_case(&paths.config_path.to_string_lossy())
                && process_is_running(state.daemon_pid)
            {
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(150));
    }

    anyhow::bail!(
        "openclaw host daemon did not become ready for {}",
        paths.config_path.display()
    )
}

fn spawn_detached_daemon(config_path: PathBuf) -> anyhow::Result<()> {
    let current_exe = env::current_exe().context("resolve openclaw-host path")?;
    let mut command = background_command(current_exe);
    detach_from_parent_process(&mut command);
    command
        .arg("daemon")
        .arg("--config")
        .arg(&config_path)
        .env(DAEMON_LAUNCH_SENTINEL, "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command.spawn().with_context(|| {
        format!(
            "spawn detached runtime host daemon for {}",
            config_path.display()
        )
    })?;

    Ok(())
}

fn submit_command_and_wait(
    paths: &HostPaths,
    kind: HostCommandKind,
) -> anyhow::Result<HostCommandResult> {
    cleanup_stale_command(paths)?;
    let command_id = format!("cmd-{}", chrono::Utc::now().timestamp_millis());
    let envelope = HostCommandEnvelope {
        command_id: command_id.clone(),
        kind,
        requested_at: chrono::Utc::now().to_rfc3339(),
    };
    write_json_file(&paths.command_path, &envelope)?;
    let started = Instant::now();

    while started.elapsed() < Duration::from_millis(CLIENT_WAIT_TIMEOUT_MS) {
        if let Some(result) = read_json_file_if_present::<HostCommandResult>(&paths.result_path)? {
            if result.command_id == command_id {
                if !result.success {
                    let error = result
                        .error
                        .clone()
                        .unwrap_or_else(|| "runtime host command failed".to_string());
                    anyhow::bail!(error);
                }
                return Ok(result);
            }
        }

        if !paths.command_path.exists() {
            if let Some(state) = read_state_if_present(paths)? {
                if state.last_command_id.as_deref() == Some(&command_id) {
                    return Ok(HostCommandResult {
                        command_id,
                        completed_at: state
                            .last_command_completed_at
                            .clone()
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                        success: state.last_error.is_none(),
                        error: state.last_error.clone(),
                        state,
                    });
                }
            }
        }

        thread::sleep(Duration::from_millis(200));
    }

    anyhow::bail!(
        "timed out waiting for runtime host {:?} command for {}",
        kind,
        paths.config_path.display()
    )
}

fn run_daemon(config_path: PathBuf) -> anyhow::Result<()> {
    let launched_detached = env::var(DAEMON_LAUNCH_SENTINEL)
        .map(|value| value == "1")
        .unwrap_or(false);
    if !launched_detached {
        anyhow::bail!("daemon must be launched via spawn-daemon");
    }

    let mut runtime_context = read_openclaw_runtime_context(&config_path).with_context(|| {
        format!(
            "read openclaw runtime context from {}",
            config_path.display()
        )
    })?;
    let paths = host_paths_from_config(&config_path);
    fs::create_dir_all(&paths.host_dir)
        .with_context(|| format!("create runtime host dir {}", paths.host_dir.display()))?;

    fs::write(&paths.daemon_pid_path, process::id().to_string())
        .with_context(|| format!("write {}", paths.daemon_pid_path.display()))?;

    let (runtime_state, runtime_pid) = observe_gateway_runtime(&runtime_context.gateway_url);
    let mut state = DaemonState {
        config_path: config_path.to_string_lossy().to_string(),
        runtime_host_kind: RUNTIME_HOST_KIND_EXTERNAL_HELPER.to_string(),
        daemon_pid: process::id(),
        daemon_started_at: chrono::Utc::now().to_rfc3339(),
        daemon_heartbeat_at: chrono::Utc::now().to_rfc3339(),
        runtime_state: runtime_state.to_string(),
        runtime_pid,
        runtime_log_path: Some(runtime_context.runtime_log_path.clone()),
        last_error: None,
        last_command_id: None,
        last_command_completed_at: None,
    };
    persist_state(&paths, &state)?;

    let mut last_runtime_reconciliation = None;
    loop {
        state.daemon_heartbeat_at = chrono::Utc::now().to_rfc3339();
        let now = Instant::now();
        if runtime_reconciliation_due(last_runtime_reconciliation, now) {
            match read_openclaw_runtime_context(&config_path) {
                Ok(refreshed_context) => {
                    runtime_context = refreshed_context;
                    state.runtime_log_path = Some(runtime_context.runtime_log_path.clone());
                    reconcile_runtime_state(&runtime_context.gateway_url, &mut state);
                }
                Err(error) => state.last_error = Some(render_error(&error)),
            }
            last_runtime_reconciliation = Some(now);
        }
        persist_state(&paths, &state)?;

        if let Some(command) =
            read_json_file_if_present::<HostCommandEnvelope>(&paths.command_path)?
        {
            let result = execute_command(&runtime_context, &mut state, &command);
            let host_result = match result {
                Ok(()) => HostCommandResult {
                    command_id: command.command_id.clone(),
                    completed_at: chrono::Utc::now().to_rfc3339(),
                    success: true,
                    error: None,
                    state: state.clone(),
                },
                Err(error) => {
                    state.last_error = Some(render_error(&error));
                    HostCommandResult {
                        command_id: command.command_id.clone(),
                        completed_at: chrono::Utc::now().to_rfc3339(),
                        success: false,
                        error: Some(render_error(&error)),
                        state: state.clone(),
                    }
                }
            };

            state.last_command_id = Some(command.command_id.clone());
            state.last_command_completed_at = Some(host_result.completed_at.clone());
            persist_state(&paths, &state)?;
            write_json_file(&paths.result_path, &host_result)?;
            let _ = fs::remove_file(&paths.command_path);
        }

        thread::sleep(Duration::from_millis(DAEMON_POLL_INTERVAL_MS));
    }
}

fn execute_command(
    runtime_context: &OpenClawRuntimeContext,
    state: &mut DaemonState,
    command: &HostCommandEnvelope,
) -> anyhow::Result<()> {
    match command.kind {
        HostCommandKind::Start => ensure_runtime_started(runtime_context, state)?,
        HostCommandKind::Stop => ensure_runtime_stopped(state)?,
        HostCommandKind::Restart => {
            let _ = ensure_runtime_stopped(state);
            ensure_runtime_started(runtime_context, state)?;
        }
    }

    state.last_error = None;
    Ok(())
}

fn ensure_runtime_started(
    runtime_context: &OpenClawRuntimeContext,
    state: &mut DaemonState,
) -> anyhow::Result<()> {
    let runtime_is_running = state.runtime_pid.is_some_and(process_is_running);
    if !runtime_launch_required(state.runtime_pid, runtime_is_running) {
        state.runtime_state = "running".to_string();
        return Ok(());
    }

    let launch = launch_managed_openclaw_from_context(runtime_context)?;
    state.runtime_pid = Some(launch.pid);
    state.runtime_log_path = Some(launch.log_path.to_string_lossy().to_string());
    state.runtime_state = "running".to_string();
    Ok(())
}

fn ensure_runtime_stopped(state: &mut DaemonState) -> anyhow::Result<()> {
    if let Some(pid) = state.runtime_pid {
        if process_is_running(pid) {
            stop_managed_openclaw(pid)?;
        }
    }

    state.runtime_pid = None;
    state.runtime_state = "stopped".to_string();
    Ok(())
}

fn reconcile_runtime_state(gateway_url: &str, state: &mut DaemonState) {
    let (runtime_state, runtime_pid) = observe_gateway_runtime(gateway_url);
    state.runtime_state = runtime_state.to_string();
    state.runtime_pid = runtime_pid;
}

fn observe_gateway_runtime(gateway_url: &str) -> (&'static str, Option<u32>) {
    let reachable = probe_gateway_runtime(gateway_url);
    let runtime_pid = reachable
        .then(|| runtime_pid_for_gateway_url(gateway_url))
        .flatten();
    gateway_runtime_observation(reachable, runtime_pid)
}

fn gateway_runtime_observation(
    gateway_reachable: bool,
    runtime_pid: Option<u32>,
) -> (&'static str, Option<u32>) {
    if gateway_reachable {
        ("running", runtime_pid)
    } else {
        ("stopped", None)
    }
}

fn runtime_launch_required(runtime_pid: Option<u32>, runtime_is_running: bool) -> bool {
    runtime_pid.is_none() || !runtime_is_running
}

fn runtime_reconciliation_due(last: Option<Instant>, now: Instant) -> bool {
    match last {
        Some(last) => now.saturating_duration_since(last) >= RUNTIME_RECONCILIATION_INTERVAL,
        None => true,
    }
}

fn cleanup_stale_command(paths: &HostPaths) -> anyhow::Result<()> {
    let Some(command) = read_json_file_if_present::<HostCommandEnvelope>(&paths.command_path)?
    else {
        return Ok(());
    };

    let requested_at = chrono::DateTime::parse_from_rfc3339(&command.requested_at)
        .map(|value| value.with_timezone(&chrono::Utc))
        .ok();
    let stale = requested_at
        .map(|value| {
            chrono::Utc::now()
                .signed_duration_since(value)
                .num_seconds()
                > STALE_COMMAND_TIMEOUT_SECS
        })
        .unwrap_or(true);

    if stale {
        let _ = fs::remove_file(&paths.command_path);
    }

    Ok(())
}

fn try_resolve_config_from_pid(pid: u32) -> anyhow::Result<String> {
    let current_exe = env::current_exe().context("resolve openclaw-host path")?;
    let Some(exe_dir) = current_exe.parent() else {
        anyhow::bail!("cannot resolve helper executable directory");
    };

    let search_roots = [env::temp_dir(), exe_dir.to_path_buf()];
    for root in search_roots {
        if let Some(config_path) = find_config_by_runtime_pid(&root, pid)? {
            return Ok(config_path);
        }
    }

    anyhow::bail!("unable to resolve config path from pid {}", pid)
}

fn find_config_by_runtime_pid(root: &Path, pid: u32) -> anyhow::Result<Option<String>> {
    if !root.exists() || !root.is_dir() {
        return Ok(None);
    }

    for entry in fs::read_dir(root).with_context(|| format!("read {}", root.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let state_path = path.join(HOST_DIR_NAME).join("state.json");
            if state_path.exists() {
                if let Ok(state) = read_json_file::<DaemonState>(&state_path) {
                    if state.runtime_pid == Some(pid) {
                        return Ok(Some(state.config_path));
                    }
                }
            }

            if let Some(found) = find_config_by_runtime_pid(&path, pid)? {
                return Ok(Some(found));
            }
        }
    }

    Ok(None)
}

fn host_paths_from_config(config_path: &Path) -> HostPaths {
    let openclaw_dir = config_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| config_path.to_path_buf());
    let host_dir = openclaw_dir.join(HOST_DIR_NAME);
    HostPaths {
        config_path: config_path.to_path_buf(),
        state_path: host_dir.join("state.json"),
        command_path: host_dir.join("command.json"),
        result_path: host_dir.join("result.json"),
        daemon_pid_path: host_dir.join("daemon.pid"),
        host_dir,
    }
}

fn persist_state(paths: &HostPaths, state: &DaemonState) -> anyhow::Result<()> {
    write_json_file(&paths.state_path, state)
}

fn read_state_if_present(paths: &HostPaths) -> anyhow::Result<Option<DaemonState>> {
    read_json_file_if_present(&paths.state_path)
}

fn write_json<T: Serialize>(value: &T) -> anyhow::Result<()> {
    let payload = serde_json::to_string(value)?;
    println!("{payload}");
    Ok(())
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, serde_json::to_vec_pretty(value)?)
        .with_context(|| format!("write {}", temp_path.display()))?;
    fs::rename(&temp_path, path)
        .or_else(|rename_error| {
            if rename_error.kind() == ErrorKind::AlreadyExists {
                let _ = fs::remove_file(path);
                fs::rename(&temp_path, path)
            } else {
                Err(rename_error)
            }
        })
        .with_context(|| format!("replace {}", path.display()))?;
    Ok(())
}

fn read_json_file<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let content = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parse {}", path.display()))
}

fn read_json_file_if_present<T: DeserializeOwned>(path: &Path) -> anyhow::Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    read_json_file(path).map(Some)
}

fn parse_named_arg(args: Vec<String>, key: &str) -> anyhow::Result<String> {
    let mut index = 0_usize;
    while index < args.len() {
        if args[index] == key {
            let value = args
                .get(index + 1)
                .cloned()
                .filter(|item| !item.trim().is_empty())
                .with_context(|| format!("missing value for {key}"))?;
            return Ok(value);
        }
        index += 1;
    }

    anyhow::bail!("missing required argument: {key}")
}

#[cfg(target_os = "windows")]
fn process_is_running(pid: u32) -> bool {
    let filter = format!("PID eq {pid}");
    let output = background_command("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output();

    let Ok(output) = output else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    text.lines().any(|line| {
        let trimmed = line.trim();
        !trimmed.is_empty() && !trimmed.starts_with("INFO:")
    })
}

#[cfg(not(target_os = "windows"))]
fn process_is_running(_pid: u32) -> bool {
    false
}

fn render_error(error: &anyhow::Error) -> String {
    error
        .chain()
        .enumerate()
        .map(|(index, cause)| {
            if index == 0 {
                cause.to_string()
            } else {
                format!("cause[{index}]: {cause}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_reconciliation_is_due_every_five_seconds() {
        let now = Instant::now();

        assert!(runtime_reconciliation_due(None, now));
        assert!(!runtime_reconciliation_due(
            Some(now - Duration::from_secs(4)),
            now
        ));
        assert!(runtime_reconciliation_due(
            Some(now - Duration::from_secs(5)),
            now
        ));
    }

    #[test]
    fn spawn_ready_timeout_waits_thirty_seconds() {
        assert_eq!(SPAWN_READY_TIMEOUT_MS, 30_000);
    }

    #[test]
    fn reachable_gateway_observation_retains_port_owner_pid_and_avoids_relaunch() {
        let (runtime_state, runtime_pid) = gateway_runtime_observation(true, Some(4321));

        assert_eq!(runtime_state, "running");
        assert_eq!(runtime_pid, Some(4321));
        assert!(!runtime_launch_required(runtime_pid, true));
    }
}
