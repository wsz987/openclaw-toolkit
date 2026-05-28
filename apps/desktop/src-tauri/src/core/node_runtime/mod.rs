use std::path::{Path, PathBuf};

use crate::core::{artifact::{install_archive, verify_sha256}, manifest::models::RequiredNodeRuntime, remote::download_remote_file};

pub fn node_runtime_dir(base_dir: &Path, node: &RequiredNodeRuntime) -> PathBuf {
    base_dir.join("runtimes").join("node").join(format!("{}-win-x64", node.version))
}

pub fn node_runtime_executable(node_dir: &Path) -> PathBuf {
    node_dir.join("node.exe")
}

pub fn ensure_node_runtime(project_root: &Path, base_dir: &Path, node: &RequiredNodeRuntime, remote_base_url: Option<&str>) -> anyhow::Result<PathBuf> {
    let dir = node_runtime_dir(base_dir, node);
    let node_exe = node_runtime_executable(&dir);

    if node_exe.exists() {
        return Ok(dir);
    }

    let artifact_path = if let Some(remote_base_url) = remote_base_url {
        let cache_path = base_dir.join("downloads").join("node").join(&node.artifact);
        download_remote_file(remote_base_url, &format!("artifacts/node/{}", node.artifact), &cache_path)?;
        cache_path
    } else {
        project_root.join("artifacts").join("node").join(&node.artifact)
    };

    if !artifact_path.exists() {
        anyhow::bail!("node runtime artifact not found: {}", artifact_path.display());
    }

    verify_sha256(&artifact_path, &node.sha256)?;
    install_archive(&artifact_path, &dir)?;

    if !node_exe.exists() {
        anyhow::bail!("node runtime install failed, missing node.exe in {}", dir.display());
    }

    Ok(dir)
}
