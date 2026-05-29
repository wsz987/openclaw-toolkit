use std::{path::{Path, PathBuf}, process::Command};

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
    let output = Command::new(executable).arg(flag).output()?;
    if !output.status.success() {
        anyhow::bail!("{} {} exited with {}", executable.display(), flag, output.status);
    }

    parse_openclaw_version_output(&String::from_utf8_lossy(&output.stdout))
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
    let output = Command::new("where").arg("openclaw").output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .find(|path| path.exists())
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
