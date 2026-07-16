use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
};

use anyhow::Context;
use serde::Deserialize;

use crate::core::{
    background_process::{background_command, process_friendly_path, render_command_output},
    node_runtime::node_runtime_executable,
    openclaw_config::{
        probe_gateway_liveness, probe_gateway_readiness, runtime_pid_for_gateway_url,
        OpenClawRuntimeContext,
    },
};

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

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGatewayStatus {
    #[serde(default)]
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

pub fn identity_matches_context(
    identity: &ManagedProcessIdentity,
    context: &OpenClawRuntimeContext,
) -> bool {
    let executable = process_friendly_path(&identity.executable_path);
    let node_dir = process_friendly_path(Path::new(&context.node_dir));
    let expected_entry = process_friendly_path(
        &PathBuf::from(&context.openclaw_dir)
            .join("package")
            .join("openclaw.mjs"),
    );

    path_is_within(&executable, &node_dir)
        && identity
            .command_line
            .to_ascii_lowercase()
            .contains(&expected_entry.to_string_lossy().to_ascii_lowercase())
        && contains_gateway_run_arguments(&identity.command_line)
}

fn path_is_within(path: &Path, directory: &Path) -> bool {
    let path = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    let directory = directory
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase();

    path == directory || path.starts_with(&format!("{directory}\\"))
}

fn contains_gateway_run_arguments(command_line: &str) -> bool {
    let arguments = command_line
        .split_whitespace()
        .map(|argument| argument.trim_matches('"'))
        .collect::<Vec<_>>();

    arguments
        .windows(2)
        .any(|pair| pair[0].eq_ignore_ascii_case("gateway") && pair[1].eq_ignore_ascii_case("run"))
}

impl RuntimeProcessAdapter for SystemRuntimeProcessAdapter {
    fn launch(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<RuntimeLaunch> {
        let node_dir = PathBuf::from(&context.node_dir);
        let node_exe = node_runtime_executable(&node_dir);
        if !node_exe.exists() {
            anyhow::bail!("managed node runtime not found: {}", node_exe.display());
        }

        let openclaw_entry = PathBuf::from(&context.openclaw_dir)
            .join("package")
            .join("openclaw.mjs");
        if !openclaw_entry.exists() {
            anyhow::bail!(
                "managed openclaw entry not found: {}",
                openclaw_entry.display()
            );
        }

        let log_path = PathBuf::from(&context.runtime_log_path);
        let log_dir = log_path
            .parent()
            .with_context(|| format!("resolve log dir from {}", log_path.display()))?;
        fs::create_dir_all(log_dir).with_context(|| format!("create {}", log_dir.display()))?;
        let stdout = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .with_context(|| format!("open {}", log_path.display()))?;
        let stderr = stdout
            .try_clone()
            .with_context(|| format!("clone log handle {}", log_path.display()))?;

        let mut command = managed_gateway_command(context, &node_exe, &openclaw_entry);
        command
            .arg("run")
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr));

        let child = command
            .spawn()
            .with_context(|| format!("launch managed openclaw via {}", node_exe.display()))?;

        Ok(RuntimeLaunch {
            pid: child.id(),
            log_path,
        })
    }

    fn is_alive(&self, pid: u32) -> bool {
        process_id_is_running(pid)
    }

    fn port_owner(&self, gateway_url: &str) -> Option<u32> {
        runtime_pid_for_gateway_url(gateway_url)
    }

    fn gateway_liveness(&self, gateway_url: &str) -> bool {
        probe_gateway_liveness(gateway_url)
    }

    fn gateway_readiness(&self, gateway_url: &str) -> bool {
        probe_gateway_readiness(gateway_url)
    }

    fn official_status(
        &self,
        context: &OpenClawRuntimeContext,
    ) -> anyhow::Result<OfficialGatewayStatus> {
        let output = managed_gateway_command_for_context(context)?
            .args(["status", "--json", "--deep"])
            .output()
            .context("run managed OpenClaw gateway status")?;
        if !output.status.success() {
            anyhow::bail!(
                "OpenClaw gateway status exited with {}{}",
                output.status,
                render_command_output(&output)
            );
        }

        serde_json::from_slice(&output.stdout).context("parse OpenClaw gateway status JSON")
    }

    fn request_official_stop(&self, context: &OpenClawRuntimeContext) -> anyhow::Result<()> {
        let output = managed_gateway_command_for_context(context)?
            .args(["stop", "--json"])
            .output()
            .context("run managed OpenClaw gateway stop")?;
        if !output.status.success() {
            anyhow::bail!(
                "OpenClaw gateway stop exited with {}{}",
                output.status,
                render_command_output(&output)
            );
        }
        Ok(())
    }

    fn identity(&self, pid: u32) -> anyhow::Result<ManagedProcessIdentity> {
        read_process_identity(pid)
    }

    fn force_stop_tree(&self, pid: u32) -> anyhow::Result<()> {
        force_stop_process_tree(pid)
    }
}

fn managed_gateway_command_for_context(
    context: &OpenClawRuntimeContext,
) -> anyhow::Result<std::process::Command> {
    let node_exe = node_runtime_executable(Path::new(&context.node_dir));
    if !node_exe.exists() {
        anyhow::bail!("managed node runtime not found: {}", node_exe.display());
    }
    let openclaw_entry = PathBuf::from(&context.openclaw_dir)
        .join("package")
        .join("openclaw.mjs");
    if !openclaw_entry.exists() {
        anyhow::bail!(
            "managed openclaw entry not found: {}",
            openclaw_entry.display()
        );
    }

    Ok(managed_gateway_command(context, &node_exe, &openclaw_entry))
}

fn managed_gateway_command(
    context: &OpenClawRuntimeContext,
    node_exe: &Path,
    openclaw_entry: &Path,
) -> std::process::Command {
    let mut command = background_command(process_friendly_path(node_exe));
    command
        .arg(process_friendly_path(openclaw_entry))
        .arg("gateway")
        .env("OPENCLAW_CONFIG_PATH", &context.config_path)
        .env("OPENCLAW_HOME", &context.openclaw_dir)
        .env("OPENCLAW_STATE_DIR", &context.openclaw_dir)
        .current_dir(process_friendly_path(
            &PathBuf::from(&context.openclaw_dir).join("package"),
        ));
    command
}

#[cfg(target_os = "windows")]
fn process_id_is_running(pid: u32) -> bool {
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

    String::from_utf8_lossy(&output.stdout).lines().any(|line| {
        let line = line.trim();
        !line.is_empty() && !line.starts_with("INFO:")
    })
}

#[cfg(not(target_os = "windows"))]
fn process_id_is_running(_pid: u32) -> bool {
    false
}

#[cfg(target_os = "windows")]
fn read_process_identity(pid: u32) -> anyhow::Result<ManagedProcessIdentity> {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct WindowsProcessIdentity {
        process_id: u32,
        executable_path: Option<PathBuf>,
        command_line: Option<String>,
    }

    let script = format!(
        "$process = Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if ($null -ne $process) {{ $process | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress }}"
    );
    let output = background_command("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .context("query managed OpenClaw process identity")?;
    if !output.status.success() {
        anyhow::bail!(
            "process identity query exited with {}{}",
            output.status,
            render_command_output(&output)
        );
    }

    let process: WindowsProcessIdentity =
        serde_json::from_slice(&output.stdout).context("parse process identity JSON")?;
    Ok(ManagedProcessIdentity {
        pid: process.process_id,
        executable_path: process
            .executable_path
            .context("process executable path is unavailable")?,
        command_line: process
            .command_line
            .context("process command line is unavailable")?,
    })
}

#[cfg(not(target_os = "windows"))]
fn read_process_identity(_pid: u32) -> anyhow::Result<ManagedProcessIdentity> {
    anyhow::bail!("managed process identity is only available on Windows")
}

#[cfg(target_os = "windows")]
fn force_stop_process_tree(pid: u32) -> anyhow::Result<()> {
    let output = background_command("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output()
        .with_context(|| format!("force stop managed OpenClaw pid {pid}"))?;
    if !output.status.success() {
        anyhow::bail!(
            "taskkill exited with {}{}",
            output.status,
            render_command_output(&output)
        );
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn force_stop_process_tree(pid: u32) -> anyhow::Result<()> {
    let output = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output()
        .with_context(|| format!("stop managed OpenClaw pid {pid}"))?;
    if !output.status.success() {
        anyhow::bail!(
            "kill exited with {}{}",
            output.status,
            render_command_output(&output)
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;

    use super::{identity_matches_context, ManagedProcessIdentity, OfficialGatewayStatus};
    use crate::core::openclaw_config::OpenClawRuntimeContext;

    fn context() -> OpenClawRuntimeContext {
        OpenClawRuntimeContext {
            openclaw_dir: r"D:\OpenClaw\openclaw\2026.5.20".to_string(),
            node_dir: r"D:\OpenClaw\runtimes\node\22.19.0-win-x64".to_string(),
            config_path: r"D:\OpenClaw\openclaw\2026.5.20\openclaw.json".to_string(),
            gateway_url: "http://127.0.0.1:18789".to_string(),
            runtime_log_path: r"D:\OpenClaw\openclaw\2026.5.20\logs\gateway-runtime.log"
                .to_string(),
        }
    }

    #[test]
    fn accepts_managed_node_and_openclaw_gateway_command() {
        let identity = ManagedProcessIdentity {
            pid: 4321,
            executable_path: PathBuf::from(r"D:\OpenClaw\runtimes\node\22.19.0-win-x64\node.exe"),
            command_line:
                r"node.exe D:\OpenClaw\openclaw\2026.5.20\package\openclaw.mjs gateway run"
                    .to_string(),
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
