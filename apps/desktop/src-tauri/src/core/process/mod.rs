use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use anyhow::Context;

use crate::core::{node_runtime::node_runtime_executable, openclaw_config::OpenClawStatusSummary};

pub struct SystemOpenClawDetection {
    pub executable: Option<PathBuf>,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub struct ManagedOpenClawLaunchResult {
    pub pid: u32,
    pub log_path: PathBuf,
}

pub struct ManagedOpenClawStopResult {
    pub stopped: bool,
}

pub fn detect_system_openclaw() -> SystemOpenClawDetection {
    let Some(executable) = find_system_openclaw() else {
        return SystemOpenClawDetection {
            executable: None,
            version: None,
            error: None,
        };
    };

    match read_openclaw_version(&executable) {
        Ok(version) => SystemOpenClawDetection {
            executable: Some(executable),
            version: Some(version),
            error: None,
        },
        Err(error) => SystemOpenClawDetection {
            executable: Some(executable),
            version: None,
            error: Some(error.to_string()),
        },
    }
}

pub fn verify_openclaw_runtime(config_path: &Path) -> anyhow::Result<()> {
    if !config_path.exists() {
        anyhow::bail!("openclaw config not found: {}", config_path.display());
    }
    Ok(())
}

pub fn launch_managed_openclaw(
    status: &OpenClawStatusSummary,
) -> anyhow::Result<ManagedOpenClawLaunchResult> {
    let node_dir = PathBuf::from(&status.node_dir);
    let node_exe = node_runtime_executable(&node_dir);
    if !node_exe.exists() {
        anyhow::bail!("managed node runtime not found: {}", node_exe.display());
    }

    let openclaw_entry = PathBuf::from(&status.openclaw_dir)
        .join("package")
        .join("openclaw.mjs");
    if !openclaw_entry.exists() {
        anyhow::bail!(
            "managed openclaw entry not found: {}",
            openclaw_entry.display()
        );
    }

    let log_dir = PathBuf::from(&status.openclaw_dir).join("logs");
    fs::create_dir_all(&log_dir).with_context(|| format!("create {}", log_dir.display()))?;
    let log_path = log_dir.join("gateway-runtime.log");
    let stdout = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .with_context(|| format!("open {}", log_path.display()))?;
    let stderr = stdout
        .try_clone()
        .with_context(|| format!("clone log handle {}", log_path.display()))?;

    let child = Command::new(&node_exe)
        .arg(&openclaw_entry)
        .arg("gateway")
        .env("OPENCLAW_CONFIG_PATH", &status.config_path)
        .env("OPENCLAW_HOME", &status.openclaw_dir)
        .current_dir(PathBuf::from(&status.openclaw_dir).join("package"))
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .with_context(|| format!("launch managed openclaw via {}", node_exe.display()))?;

    Ok(ManagedOpenClawLaunchResult {
        pid: child.id(),
        log_path,
    })
}

pub fn stop_managed_openclaw(pid: u32) -> anyhow::Result<ManagedOpenClawStopResult> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .with_context(|| format!("stop managed openclaw pid {}", pid))?;

        if !status.success() {
            anyhow::bail!("taskkill exited with {}", status);
        }

        return Ok(ManagedOpenClawStopResult { stopped: true });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .with_context(|| format!("stop managed openclaw pid {}", pid))?;

        if !status.success() {
            anyhow::bail!("kill exited with {}", status);
        }

        Ok(ManagedOpenClawStopResult { stopped: true })
    }
}

fn read_openclaw_version(executable: &Path) -> anyhow::Result<String> {
    run_openclaw_version_command(executable, "--version")
        .or_else(|_| run_openclaw_version_command(executable, "-v"))
}

fn run_openclaw_version_command(executable: &Path, flag: &str) -> anyhow::Result<String> {
    let output = openclaw_version_command(executable).arg(flag).output()?;
    if !output.status.success() {
        anyhow::bail!(
            "{} {} exited with {}",
            executable.display(),
            flag,
            output.status
        );
    }

    parse_openclaw_version_output(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn openclaw_version_command(executable: &Path) -> Command {
    let extension = executable
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("exe") => Command::new(executable),
        Some("cmd") | Some("bat") => {
            let mut command = Command::new("cmd");
            command.arg("/c").arg(executable);
            command
        }
        Some("ps1") => {
            let mut command = Command::new("powershell");
            command
                .arg("-NoProfile")
                .arg("-ExecutionPolicy")
                .arg("Bypass")
                .arg("-File")
                .arg(executable);
            command
        }
        _ => {
            if let Some(sibling_cmd) = sibling_command(executable, "cmd") {
                let mut command = Command::new("cmd");
                command.arg("/c").arg(sibling_cmd);
                return command;
            }

            if let Some(sibling_exe) = sibling_command(executable, "exe") {
                return Command::new(sibling_exe);
            }

            let mut command = Command::new("cmd");
            command.arg("/c").arg(executable);
            command
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn openclaw_version_command(executable: &Path) -> Command {
    Command::new(executable)
}

#[cfg(target_os = "windows")]
fn sibling_command(executable: &Path, extension: &str) -> Option<PathBuf> {
    let candidate = executable.with_extension(extension);
    candidate.exists().then_some(candidate)
}

fn parse_openclaw_version_output(output: &str) -> anyhow::Result<String> {
    let value = output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default();

    if value.is_empty() {
        anyhow::bail!("OpenClaw 版本输出为空");
    }

    Ok(value.trim_start_matches('v').to_string())
}

#[cfg(target_os = "windows")]
fn find_system_openclaw() -> Option<PathBuf> {
    for candidate in ["openclaw.cmd", "openclaw.exe", "openclaw.ps1", "openclaw"] {
        let output = Command::new("where").arg(candidate).output().ok()?;
        if !output.status.success() {
            continue;
        }

        if let Some(path) = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(PathBuf::from)
            .find(|path| path.exists())
        {
            return Some(path);
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn find_system_openclaw() -> Option<PathBuf> {
    None
}

#[cfg(test)]
mod tests {
    use super::parse_openclaw_version_output;

    #[test]
    fn parses_openclaw_version_output() {
        assert_eq!(parse_openclaw_version_output("v1.2.3\n").unwrap(), "1.2.3");
        assert_eq!(
            parse_openclaw_version_output("openclaw 1.2.3\n").unwrap(),
            "openclaw 1.2.3"
        );
    }

    #[test]
    fn rejects_empty_openclaw_version_output() {
        assert!(parse_openclaw_version_output("\n").is_err());
    }
}
