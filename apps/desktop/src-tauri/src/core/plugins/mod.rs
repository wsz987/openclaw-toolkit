use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use semver::{Version, VersionReq};

use crate::core::{
    artifact::verify_sha256,
    background_process::background_command,
    manifest::{
        load_plugin_manifest,
        models::{InstalledManifest, InstalledPlugin, PluginArtifact},
    },
    node_runtime::{node_runtime_executable, node_runtime_npm_command, parse_node_version},
};

const DEFAULT_NPM_REGISTRY_URL: &str = "https://registry.npmmirror.com";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallInput {
    pub config_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallResult {
    pub config_path: String,
    pub plugin_id: String,
    pub plugin_entry_id: String,
    pub package: String,
    pub version: String,
    pub artifact_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallProgress {
    pub stage: String,
    pub progress: u8,
    pub message: String,
    pub done: bool,
    pub failed: bool,
}

pub fn install_plugin_from_manifest(
    config_path: &Path,
    requested_plugin_id: &str,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<PluginInstallResult> {
    emit_plugin_install_progress(
        progress_callback,
        "resolving",
        8,
        &format!("正在解析插件清单：{requested_plugin_id}"),
        false,
        false,
    );
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
    let installed_manifest = read_installed_manifest(&installed_manifest_path)?;
    let project_root = resolve_resource_root_from_openclaw_dir(openclaw_dir)?;
    let plugin_manifest = load_plugin_manifest(&project_root)?;
    let plugin = resolve_plugin(&plugin_manifest.plugins, requested_plugin_id)?;

    emit_plugin_install_progress(
        progress_callback,
        "validating",
        18,
        &format!("正在校验插件 {} 的版本兼容性...", plugin.id),
        false,
        false,
    );
    validate_plugin_compatibility(&plugin, &installed_manifest)?;

    let artifact_path = project_root
        .join("artifacts")
        .join("plugins")
        .join(&plugin.id)
        .join(&plugin.artifact);
    if !artifact_path.exists() {
        anyhow::bail!("插件离线包不存在：{}", artifact_path.display());
    }
    emit_plugin_install_progress(
        progress_callback,
        "verifying",
        32,
        &format!("正在校验插件离线包：{}", plugin.artifact),
        false,
        false,
    );
    verify_sha256(&artifact_path, &plugin.sha256)?;

    let package_dir = openclaw_dir.join("package");
    if !package_dir.exists() {
        anyhow::bail!("OpenClaw package 目录不存在：{}", package_dir.display());
    }

    emit_plugin_install_progress(
        progress_callback,
        "installing",
        56,
        &format!("正在安装插件包 {} ...", plugin.package),
        false,
        false,
    );
    install_plugin_package(&package_dir, &installed_manifest.node_dir, &artifact_path)?;
    emit_plugin_install_progress(
        progress_callback,
        "recording",
        88,
        "正在写入安装记录...",
        false,
        false,
    );
    update_installed_manifest(&installed_manifest_path, &installed_manifest, &plugin)?;
    emit_plugin_install_progress(
        progress_callback,
        "ready",
        100,
        &format!("插件 {} 安装完成。", plugin.id),
        true,
        false,
    );

    Ok(PluginInstallResult {
        config_path: config_path.to_string_lossy().to_string(),
        plugin_id: plugin.id.clone(),
        plugin_entry_id: plugin.plugin_entry_id.clone(),
        package: plugin.package.clone(),
        version: plugin.version.clone(),
        artifact_path: artifact_path.to_string_lossy().to_string(),
    })
}

fn resolve_plugin<'a>(
    plugins: &'a [PluginArtifact],
    requested_plugin_id: &str,
) -> anyhow::Result<&'a PluginArtifact> {
    plugins
        .iter()
        .find(|plugin| {
            plugin.id.eq_ignore_ascii_case(requested_plugin_id)
                || plugin
                    .plugin_entry_id
                    .eq_ignore_ascii_case(requested_plugin_id)
                || plugin
                    .aliases
                    .iter()
                    .any(|alias| alias.eq_ignore_ascii_case(requested_plugin_id))
        })
        .ok_or_else(|| anyhow::anyhow!("未找到插件离线制品：{}", requested_plugin_id))
}

fn validate_plugin_compatibility(
    plugin: &PluginArtifact,
    installed_manifest: &InstalledManifest,
) -> anyhow::Result<()> {
    if let Some(range) = plugin.openclaw_version_range.as_deref() {
        let version =
            parse_semver_like(&installed_manifest.openclaw_version).with_context(|| {
                format!(
                    "解析 OpenClaw 版本失败：{}",
                    installed_manifest.openclaw_version
                )
            })?;
        ensure_version_matches(&version, range, "OpenClaw")?;
    }

    if let Some(range) = plugin.node_version_range.as_deref() {
        let version = parse_node_version(&installed_manifest.node_version)
            .with_context(|| format!("解析 Node 版本失败：{}", installed_manifest.node_version))?;
        ensure_version_matches(&version, range, "Node")?;
    }

    Ok(())
}

fn ensure_version_matches(version: &Version, range: &str, label: &str) -> anyhow::Result<()> {
    let normalized = range.split_whitespace().collect::<Vec<_>>().join(", ");
    let requirement = VersionReq::parse(&normalized)
        .with_context(|| format!("解析 {label} 版本范围失败：{range}"))?;
    if !requirement.matches(version) {
        anyhow::bail!("{label} 版本 {} 不满足插件要求 {}", version, range);
    }

    Ok(())
}

fn parse_semver_like(value: &str) -> anyhow::Result<Version> {
    Version::parse(value).with_context(|| format!("解析版本失败：{}", value))
}

fn install_plugin_package(
    package_dir: &Path,
    node_dir: &str,
    artifact_path: &Path,
) -> anyhow::Result<()> {
    let node_dir = PathBuf::from(node_dir);
    let node_exe = node_runtime_executable(&node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let npm_cmd = node_runtime_npm_command(&node_dir);
    if !npm_cmd.exists() {
        anyhow::bail!("npm.cmd not found: {}", npm_cmd.display());
    }

    let status = background_command("cmd")
        .args([
            "/C",
            npm_cmd.to_string_lossy().as_ref(),
            "install",
            artifact_path.to_string_lossy().as_ref(),
            "--omit=dev",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--registry",
            DEFAULT_NPM_REGISTRY_URL,
        ])
        .current_dir(package_dir)
        .env("npm_config_registry", DEFAULT_NPM_REGISTRY_URL)
        .status()
        .context("run npm install for offline plugin")?;

    if !status.success() {
        anyhow::bail!("插件 npm install 失败，退出状态 {}", status);
    }

    Ok(())
}

fn update_installed_manifest(
    manifest_path: &Path,
    installed_manifest: &InstalledManifest,
    plugin: &PluginArtifact,
) -> anyhow::Result<()> {
    let mut updated = installed_manifest.clone();
    updated.plugins.retain(|item| item.id != plugin.id);
    updated.plugins.push(InstalledPlugin {
        id: plugin.id.clone(),
        version: plugin.version.clone(),
        package: Some(plugin.package.clone()),
    });
    updated
        .plugins
        .sort_by(|left, right| left.id.cmp(&right.id));

    fs::write(manifest_path, serde_json::to_string_pretty(&updated)?)
        .with_context(|| format!("write installed manifest {}", manifest_path.display()))?;
    Ok(())
}

fn read_installed_manifest(path: &Path) -> anyhow::Result<InstalledManifest> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("read installed manifest {}", path.display()))?;
    serde_json::from_str(&raw)
        .with_context(|| format!("parse installed manifest {}", path.display()))
}

fn resolve_resource_root_from_openclaw_dir(openclaw_dir: &Path) -> anyhow::Result<PathBuf> {
    let base_dir = openclaw_dir
        .parent()
        .and_then(Path::parent)
        .with_context(|| format!("resolve base dir from {}", openclaw_dir.display()))?;

    let mut candidates = Vec::new();
    if let Ok(explicit_root) = std::env::var("OPENCLAW_TOOLKIT_ROOT") {
        candidates.push(PathBuf::from(explicit_root));
    }
    candidates.extend(path_with_ancestors(base_dir.to_path_buf(), 4));

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.extend(path_with_ancestors(current_dir, 5));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend(path_with_ancestors(exe_dir.to_path_buf(), 6));
        }
    }

    for candidate in candidates {
        if candidate
            .join("artifacts")
            .join("toolkit-manifest.json")
            .exists()
        {
            return Ok(candidate);
        }
    }

    anyhow::bail!("未找到安装资源目录：需要存在 artifacts/toolkit-manifest.json")
}

fn path_with_ancestors(start: PathBuf, levels: usize) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut current = Some(start.as_path());

    for _ in 0..=levels {
        let Some(path) = current else {
            break;
        };
        paths.push(path.to_path_buf());
        current = path.parent();
    }

    paths
}

fn emit_plugin_install_progress(
    callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
    stage: &str,
    progress: u8,
    message: &str,
    done: bool,
    failed: bool,
) {
    if let Some(callback) = callback {
        callback(&PluginInstallProgress {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
            done,
            failed,
        });
    }
}
