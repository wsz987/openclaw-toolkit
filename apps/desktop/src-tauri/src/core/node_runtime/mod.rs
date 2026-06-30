use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use semver::{Version, VersionReq};

use crate::core::{
    artifact::{install_archive, verify_sha256},
    background_process::background_command,
    manifest::models::RequiredNodeRuntime,
    remote::download_remote_file,
};

const DEFAULT_NPM_REGISTRY_URL: &str = "https://registry.npmmirror.com";
const DEFAULT_NODE_DIST_MIRROR_URL: &str = "https://npmmirror.com/mirrors/node";
const DEFAULT_ELECTRON_MIRROR_URL: &str = "https://npmmirror.com/mirrors/electron/";
const DEFAULT_PLAYWRIGHT_DOWNLOAD_HOST: &str = "https://npmmirror.com/mirrors/playwright";

pub fn node_runtime_dir(base_dir: &Path, node: &RequiredNodeRuntime) -> PathBuf {
    base_dir
        .join("runtimes")
        .join("node")
        .join(format!("{}-win-x64", node.version))
}

pub fn node_runtime_executable(node_dir: &Path) -> PathBuf {
    node_runtime_file(node_dir, "node.exe")
}

pub fn node_runtime_npm_command(node_dir: &Path) -> PathBuf {
    node_runtime_file(node_dir, "npm.cmd")
}

pub fn node_runtime_npx_command(node_dir: &Path) -> PathBuf {
    node_runtime_file(node_dir, "npx.cmd")
}

pub fn node_runtime_npmrc_path(node_dir: &Path) -> PathBuf {
    let node_exe = node_runtime_executable(node_dir);
    node_exe.parent().unwrap_or(node_dir).join(".npmrc")
}

pub fn ensure_node_runtime(
    project_root: &Path,
    base_dir: &Path,
    node: &RequiredNodeRuntime,
    remote_base_url: Option<&str>,
) -> anyhow::Result<PathBuf> {
    validate_required_node(node)?;

    let dir = node_runtime_dir(base_dir, node);
    let initial_node_exe = node_runtime_executable(&dir);

    if initial_node_exe.exists() && validate_node_executable(&initial_node_exe, &node.range).is_ok()
    {
        ensure_node_runtime_mirror_config(&dir)?;
        return Ok(dir);
    }

    let artifact_path = if let Some(remote_base_url) = remote_base_url {
        let cache_path = base_dir.join("downloads").join("node").join(&node.artifact);
        download_remote_file(
            remote_base_url,
            &format!("artifacts/node/{}", node.artifact),
            &cache_path,
        )?;
        cache_path
    } else {
        project_root
            .join("artifacts")
            .join("node")
            .join(&node.artifact)
    };

    if !artifact_path.exists() {
        anyhow::bail!(
            "node runtime artifact not found: {}",
            artifact_path.display()
        );
    }

    verify_sha256(&artifact_path, &node.sha256)?;
    install_archive(&artifact_path, &dir)?;

    let node_exe = node_runtime_executable(&dir);
    if !node_exe.exists() {
        anyhow::bail!(
            "node runtime install failed, missing node.exe in {}",
            dir.display()
        );
    }

    validate_node_executable(&node_exe, &node.range)
        .with_context(|| format!("校验 Node Runtime 失败：{}", node_exe.display()))?;

    ensure_node_runtime_mirror_config(&dir)?;

    Ok(dir)
}

pub fn ensure_node_runtime_mirror_config(node_dir: &Path) -> anyhow::Result<PathBuf> {
    let npmrc_path = node_runtime_npmrc_path(node_dir);
    let content = format!(
        concat!(
            "registry={registry}\n",
            "disturl={disturl}\n",
            "runtime_mirror={disturl}\n",
            "audit=false\n",
            "fund=false\n",
            "python=python\n",
            "electron_mirror={electron}\n",
            "playwright_download_host={playwright}\n"
        ),
        registry = DEFAULT_NPM_REGISTRY_URL,
        disturl = DEFAULT_NODE_DIST_MIRROR_URL,
        electron = DEFAULT_ELECTRON_MIRROR_URL,
        playwright = DEFAULT_PLAYWRIGHT_DOWNLOAD_HOST,
    );
    fs::write(&npmrc_path, content)
        .with_context(|| format!("write node runtime npmrc {}", npmrc_path.display()))?;
    Ok(npmrc_path)
}

pub fn detect_system_node() -> SystemNodeDetection {
    let Some(executable) = find_system_node() else {
        return SystemNodeDetection {
            executable: None,
            version: None,
            error: None,
        };
    };

    match read_node_version(&executable) {
        Ok(version) => SystemNodeDetection {
            executable: Some(executable),
            version: Some(version),
            error: None,
        },
        Err(error) => SystemNodeDetection {
            executable: Some(executable),
            version: None,
            error: Some(error.to_string()),
        },
    }
}

#[derive(Debug, Clone)]
pub struct SystemNodeDetection {
    pub executable: Option<PathBuf>,
    pub version: Option<Version>,
    pub error: Option<String>,
}

pub fn validate_required_node(node: &RequiredNodeRuntime) -> anyhow::Result<()> {
    let pinned = parse_node_version(&node.version)?;
    let requirement = parse_node_range(&node.range)
        .with_context(|| format!("解析 requiredNode.range 失败：{}", node.range))?;

    if !requirement.matches(&pinned) {
        anyhow::bail!(
            "requiredNode.version {} 不满足 requiredNode.range {}",
            node.version,
            node.range
        );
    }

    Ok(())
}

pub fn validate_node_executable(node_exe: &Path, range: &str) -> anyhow::Result<Version> {
    let actual = read_node_version(node_exe)?;
    ensure_node_version_matches(&actual, range)?;
    Ok(actual)
}

pub fn ensure_node_version_matches(actual: &Version, range: &str) -> anyhow::Result<()> {
    let requirement =
        parse_node_range(range).with_context(|| format!("解析 Node 版本范围失败：{}", range))?;
    if !requirement.matches(actual) {
        anyhow::bail!("当前 Node Runtime 版本 {} 不满足要求 {}", actual, range);
    }

    Ok(())
}

fn parse_node_range(range: &str) -> anyhow::Result<VersionReq> {
    let normalized = range.split_whitespace().collect::<Vec<_>>().join(", ");
    VersionReq::parse(&normalized).with_context(|| format!("解析 Node 版本范围失败：{}", range))
}

pub fn parse_node_version(value: &str) -> anyhow::Result<Version> {
    let normalized = value.trim().trim_start_matches('v');
    Version::parse(normalized).with_context(|| format!("解析 Node 版本失败：{}", value))
}

fn read_node_version(node_exe: &Path) -> anyhow::Result<Version> {
    let output = background_command(node_exe)
        .arg("--version")
        .output()
        .with_context(|| format!("执行 {} --version 失败", node_exe.display()))?;

    if !output.status.success() {
        anyhow::bail!(
            "{} --version 退出失败：{}",
            node_exe.display(),
            output.status
        );
    }

    let stdout = String::from_utf8(output.stdout).context("读取 node --version 输出失败")?;
    parse_node_version(&stdout)
}

fn node_runtime_file(node_dir: &Path, file_name: &str) -> PathBuf {
    resolve_node_runtime_file(node_dir, file_name).unwrap_or_else(|| node_dir.join(file_name))
}

fn resolve_node_runtime_file(node_dir: &Path, file_name: &str) -> Option<PathBuf> {
    let direct = node_dir.join(file_name);
    if direct.exists() {
        return Some(direct);
    }

    let entries = fs::read_dir(node_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !entry.file_type().ok()?.is_dir() {
            continue;
        }

        let nested = path.join(file_name);
        if nested.exists() {
            return Some(nested);
        }
    }

    None
}

fn find_system_node() -> Option<PathBuf> {
    let output = background_command("where").arg("node").output().ok()?;
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

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        ensure_node_version_matches, node_runtime_executable, node_runtime_npm_command,
        parse_node_version, validate_required_node,
    };
    use crate::core::manifest::models::RequiredNodeRuntime;

    #[test]
    fn parses_node_version_with_v_prefix() {
        let version = parse_node_version("v20.11.1\n").unwrap();

        assert_eq!(version.major, 20);
        assert_eq!(version.minor, 11);
        assert_eq!(version.patch, 1);
    }

    #[test]
    fn validates_node_version_range() {
        let version = parse_node_version("v20.11.1").unwrap();

        assert!(ensure_node_version_matches(&version, ">=20 <21").is_ok());
        assert!(ensure_node_version_matches(&version, ">=21 <22").is_err());
    }

    #[test]
    fn rejects_inconsistent_required_node_manifest() {
        let node = RequiredNodeRuntime {
            version: "20.11.1".to_string(),
            range: ">=18 <20".to_string(),
            artifact: "node.zip".to_string(),
            sha256: "sha".to_string(),
            signature: None,
        };

        assert!(validate_required_node(&node).is_err());
    }

    #[test]
    fn resolves_nested_node_runtime_executable() {
        let temp_dir = unique_temp_dir("node-runtime-exe");
        let nested_dir = temp_dir.join("node-v22.19.0-win-x64");
        fs::create_dir_all(&nested_dir).unwrap();
        fs::write(nested_dir.join("node.exe"), []).unwrap();

        assert_eq!(
            node_runtime_executable(&temp_dir),
            nested_dir.join("node.exe")
        );

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn resolves_nested_node_runtime_npm_command() {
        let temp_dir = unique_temp_dir("node-runtime-npm");
        let nested_dir = temp_dir.join("node-v22.19.0-win-x64");
        fs::create_dir_all(&nested_dir).unwrap();
        fs::write(nested_dir.join("npm.cmd"), []).unwrap();

        assert_eq!(
            node_runtime_npm_command(&temp_dir),
            nested_dir.join("npm.cmd")
        );

        fs::remove_dir_all(temp_dir).unwrap();
    }

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("openclaw-{label}-{suffix}"))
    }
}
