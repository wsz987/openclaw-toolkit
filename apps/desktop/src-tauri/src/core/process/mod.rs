use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
};

pub struct SystemOpenClawDetection {
    pub executable: Option<PathBuf>,
    pub version: Option<String>,
    pub error: Option<String>,
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

fn read_openclaw_version(executable: &Path) -> anyhow::Result<String> {
    run_openclaw_version_command(executable, "--version")
        .or_else(|_| run_openclaw_version_command(executable, "-v"))
}

fn run_openclaw_version_command(executable: &Path, flag: &str) -> anyhow::Result<String> {
    let output = openclaw_version_command(executable).arg(flag).output()?;
    if !output.status.success() {
        anyhow::bail!("{} {} exited with {}", executable.display(), flag, output.status);
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
        assert_eq!(parse_openclaw_version_output("openclaw 1.2.3\n").unwrap(), "openclaw 1.2.3");
    }

    #[test]
    fn rejects_empty_openclaw_version_output() {
        assert!(parse_openclaw_version_output("\n").is_err());
    }
}
