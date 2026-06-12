use std::path::PathBuf;

use anyhow::Context;

use crate::core::{
    background_process::{background_command, render_command_output},
    openclaw_config::OpenClawStatusSummary,
    process::launch_managed_openclaw,
    process::stop_managed_openclaw,
};

pub const RUNTIME_HOST_KIND_DIRECT_PROCESS: &str = "direct-process";
pub const RUNTIME_HOST_KIND_EXTERNAL_HELPER: &str = "external-helper";
pub const RUNTIME_HOST_KIND_WINDOWS_SERVICE: &str = "windows-service";

pub struct ManagedRuntimeLaunchResult {
    pub pid: u32,
    pub log_path: PathBuf,
    pub runtime_host_kind: String,
}

pub struct ManagedRuntimeStopResult {
    pub stopped: bool,
    pub runtime_host_kind: String,
}

pub fn default_runtime_host_kind() -> &'static str {
    RUNTIME_HOST_KIND_DIRECT_PROCESS
}

pub fn launch_openclaw_runtime(
    status: &OpenClawStatusSummary,
) -> anyhow::Result<ManagedRuntimeLaunchResult> {
    if let Some(helper_executable) = resolve_external_helper_executable() {
        return launch_via_external_helper(&helper_executable, &status.config_path);
    }

    let launch = launch_managed_openclaw(status)?;
    Ok(ManagedRuntimeLaunchResult {
        pid: launch.pid,
        log_path: launch.log_path,
        runtime_host_kind: default_runtime_host_kind().to_string(),
    })
}

pub fn stop_openclaw_runtime(
    runtime_host_kind: Option<&str>,
    config_path: &str,
    pid: Option<u32>,
) -> anyhow::Result<ManagedRuntimeStopResult> {
    match normalize_runtime_host_kind(runtime_host_kind) {
        RUNTIME_HOST_KIND_EXTERNAL_HELPER => {
            if let Some(helper_executable) = resolve_external_helper_executable() {
                return stop_via_external_helper(&helper_executable, config_path);
            }

            let pid = pid.context("runtime pid is required for direct fallback stop")?;
            let result = stop_managed_openclaw(pid)?;
            Ok(ManagedRuntimeStopResult {
                stopped: result.stopped,
                runtime_host_kind: RUNTIME_HOST_KIND_DIRECT_PROCESS.to_string(),
            })
        }
        RUNTIME_HOST_KIND_DIRECT_PROCESS => {
            let pid = pid.context("runtime pid is required for direct stop")?;
            let result = stop_managed_openclaw(pid)?;
            Ok(ManagedRuntimeStopResult {
                stopped: result.stopped,
                runtime_host_kind: RUNTIME_HOST_KIND_DIRECT_PROCESS.to_string(),
            })
        }
        other => anyhow::bail!("unsupported runtime host kind: {other}"),
    }
}

fn normalize_runtime_host_kind(runtime_host_kind: Option<&str>) -> &str {
    match runtime_host_kind.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => value,
        None => default_runtime_host_kind(),
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalHelperLaunchResponse {
    pid: u32,
    log_path: String,
    runtime_host_kind: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalHelperStopResponse {
    stopped: bool,
    runtime_host_kind: String,
}

fn launch_via_external_helper(
    helper_executable: &PathBuf,
    config_path: &str,
) -> anyhow::Result<ManagedRuntimeLaunchResult> {
    let output = background_command(helper_executable)
        .args(["start", "--config", config_path])
        .output()
        .with_context(|| {
            format!(
                "invoke openclaw host helper start via {}",
                helper_executable.display()
            )
        })?;

    if !output.status.success() {
        anyhow::bail!(
            "openclaw host helper start failed with status {}{}",
            output.status,
            render_command_output(&output)
        );
    }

    let response: ExternalHelperLaunchResponse = serde_json::from_slice(&output.stdout)
        .with_context(|| {
            format!(
                "parse openclaw host helper start response from {}",
                helper_executable.display()
            )
        })?;

    Ok(ManagedRuntimeLaunchResult {
        pid: response.pid,
        log_path: PathBuf::from(response.log_path),
        runtime_host_kind: response.runtime_host_kind,
    })
}

fn stop_via_external_helper(
    helper_executable: &PathBuf,
    config_path: &str,
) -> anyhow::Result<ManagedRuntimeStopResult> {
    let output = background_command(helper_executable)
        .args(["stop", "--config", config_path])
        .output()
        .with_context(|| {
            format!(
                "invoke openclaw host helper stop via {}",
                helper_executable.display()
            )
        })?;

    if !output.status.success() {
        anyhow::bail!(
            "openclaw host helper stop failed with status {}{}",
            output.status,
            render_command_output(&output)
        );
    }

    let response: ExternalHelperStopResponse = serde_json::from_slice(&output.stdout)
        .with_context(|| {
            format!(
                "parse openclaw host helper stop response from {}",
                helper_executable.display()
            )
        })?;

    Ok(ManagedRuntimeStopResult {
        stopped: response.stopped,
        runtime_host_kind: response.runtime_host_kind,
    })
}

fn resolve_external_helper_executable() -> Option<PathBuf> {
    if let Ok(explicit_path) = std::env::var("OPENCLAW_RUNTIME_HOST_EXE") {
        let candidate = PathBuf::from(explicit_path.trim());
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let current_exe = std::env::current_exe().ok()?;
    let exe_dir = current_exe.parent()?;
    for file_name in ["openclaw-host.exe", "openclaw-host"] {
        let candidate = exe_dir.join(file_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}
