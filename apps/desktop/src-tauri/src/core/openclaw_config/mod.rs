use std::{fs, path::{Path, PathBuf}, process::Command};

use anyhow::Context;
use serde_json::json;

use crate::core::{artifact::{install_archive, verify_sha256}, manifest::models::ReleaseArtifact, node_runtime::node_runtime_executable, remote::download_remote_file};

pub fn openclaw_dir(base_dir: &Path, release: &ReleaseArtifact) -> PathBuf {
    base_dir.join("openclaw").join(&release.version)
}

pub fn install_openclaw(project_root: &Path, base_dir: &Path, release: &ReleaseArtifact, install_mode: &str, node_dir: &Path, remote_base_url: Option<&str>) -> anyhow::Result<PathBuf> {
    let openclaw_dir = openclaw_dir(base_dir, release);

    if install_mode == "npm" {
        install_openclaw_via_npm(&openclaw_dir, &release.version, node_dir)?;
    } else {
        let artifact_path = if let Some(remote_base_url) = remote_base_url {
            let cache_path = base_dir.join("downloads").join("openclaw").join(&release.artifact);
            download_remote_file(remote_base_url, &format!("artifacts/openclaw/{}", release.artifact), &cache_path)?;
            cache_path
        } else {
            project_root.join("artifacts").join("openclaw").join(&release.artifact)
        };

        if !artifact_path.exists() {
            anyhow::bail!("openclaw artifact not found: {}", artifact_path.display());
        }

        verify_sha256(&artifact_path, &release.sha256)?;
        install_archive(&artifact_path, &openclaw_dir)?;
    }

    if !openclaw_dir.exists() {
        anyhow::bail!("openclaw install failed: {}", openclaw_dir.display());
    }

    Ok(openclaw_dir)
}

pub fn write_openclaw_config(config_path: &Path, release: &ReleaseArtifact, tier: &str, openclaw_dir: &Path, node_dir: &Path) -> anyhow::Result<()> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create config dir {}", parent.display()))?;
    }

    let config = json!({
        "version": 1,
        "openclawVersion": release.version,
        "tier": tier,
        "runtime": {
            "workspaceDir": openclaw_dir.join("workspace").to_string_lossy(),
            "nodeDir": node_dir.to_string_lossy()
        },
        "permissions": {
            "filesystem": {
                "allowRead": [openclaw_dir.join("workspace").to_string_lossy(), openclaw_dir.join("config").to_string_lossy()],
                "allowWrite": [openclaw_dir.join("workspace").to_string_lossy()],
                "deny": ["C:\\Windows", "C:\\Program Files"]
            },
            "shell": {
                "enabled": true,
                "allowCommands": ["node", "npm", "openclaw", "powershell"],
                "denyPatterns": ["Remove-Item\\s+-Recurse", "format\\s+", "reg\\s+delete", "net\\s+user"]
            },
            "browser": {
                "enabled": true,
                "mode": "managed-edge",
                "allowDomains": ["localhost", "*.intranet.local"]
            }
        },
        "skills": release.skills,
        "providers": [],
        "plugins": {}
    });

    fs::write(config_path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

fn install_openclaw_via_npm(openclaw_dir: &Path, version: &str, node_dir: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(openclaw_dir).with_context(|| format!("create openclaw dir {}", openclaw_dir.display()))?;

    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let npm_cmd = node_dir.join("npm.cmd");
    if !npm_cmd.exists() {
        anyhow::bail!("npm.cmd not found: {}", npm_cmd.display());
    }

    let status = Command::new("cmd")
        .args([
            "/C",
            npm_cmd.to_string_lossy().as_ref(),
            "install",
            &format!("openclaw@{}", version),
            "--prefix",
            &openclaw_dir.to_string_lossy(),
            "--no-audit",
            "--no-fund",
        ])
        .status()
        .context("run npm install")?;

    if !status.success() {
        anyhow::bail!("npm install failed with status {}", status);
    }

    Ok(())
}
