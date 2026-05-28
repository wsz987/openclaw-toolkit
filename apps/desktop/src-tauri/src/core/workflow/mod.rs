use std::path::PathBuf;

use anyhow::Context;
use chrono::Utc;
use semver::Version;
use serde::{Deserialize, Serialize};

use crate::core::{
    browser::configure_browser_runtime,
    license::verify_offline_license,
    manifest::{
        load_release_manifest, load_toolkit_manifest, load_toolkit_settings, write_installed_manifest,
        models::InstalledManifest,
    },
    node_runtime::ensure_node_runtime,
    openclaw_config::{install_openclaw, openclaw_dir as resolve_openclaw_dir, write_openclaw_config},
    permissions::configure_permissions,
    process::verify_openclaw_runtime,
    remote::load_release_manifest_from_remote,
    runtime::{append_install_log, backup_existing_dir},
    skills::install_skills,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1InstallInput {
    pub project_root: String,
    pub base_dir: Option<String>,
    pub license_key: Option<String>,
    pub install_mode: Option<String>,
    pub selected_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1InstallResult {
    pub workflow_id: String,
    pub status: String,
    pub openclaw_version: String,
    pub node_version: String,
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum InstallStep {
    LoadManifest,
    ValidateLicense,
    CheckEnvironment,
    SelectInstallMode,
    ResolveOpenClawVersion,
    ResolveNodeRuntime,
    InstallNodeRuntime,
    ResolveOpenClawArtifact,
    InstallOpenClaw,
    WriteInstalledManifest,
    GenerateOpenClawConfig,
    InstallSkills,
    ConfigurePermissions,
    ConfigureBrowser,
    VerifyRuntime,
}

pub fn run_stage1_install(input: Stage1InstallInput) -> anyhow::Result<Stage1InstallResult> {
    let workflow_id = uuid_like();
    let project_root = PathBuf::from(&input.project_root);
    let base_dir = input
        .base_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| project_root.join("runtime"));
    let install_mode = input.install_mode.unwrap_or_else(|| "local".to_string());

    append_install_log(&base_dir, &format!("{} start stage1 install", workflow_id))?;

    let toolkit_manifest = load_toolkit_manifest(&project_root)?;
    let toolkit_settings = load_toolkit_settings(&project_root)?;
    let license = verify_offline_license(input.license_key.as_deref())?;

    if !license.features.iter().any(|feature| feature == "managed-node-runtime") {
        anyhow::bail!("当前授权不包含 OpenClaw 受管 Node Runtime 能力");
    }

    let release_manifest = if install_mode == "remote" {
        let remote_base_url = toolkit_settings
            .remote_base_url
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("远程模式未配置远程服务器地址"))?;
        load_release_manifest_from_remote(remote_base_url)?
    } else {
        load_release_manifest(&project_root)?
    };

    let selected_version = resolve_selected_version(
        &toolkit_manifest.default_openclaw_version,
        input.selected_version.as_deref(),
        &release_manifest,
    )?;

    let release = release_manifest
        .releases
        .iter()
        .find(|release| release.version == selected_version)
        .cloned()
        .with_context(|| format!("OpenClaw release {} not found", selected_version))?;

    check_environment()?;

    let target_openclaw_dir = resolve_openclaw_dir(&base_dir, &release);
    if let Some(backup_dir) = backup_existing_dir(&target_openclaw_dir, &base_dir, &format!("openclaw-{}", release.version))? {
        append_install_log(&base_dir, &format!("{} backup existing openclaw to {}", workflow_id, backup_dir.display()))?;
    }

    let remote_base_url = toolkit_settings.remote_base_url.as_deref();
    let node_dir = ensure_node_runtime(&project_root, &base_dir, &release.required_node, remote_base_url)?;
    append_install_log(&base_dir, &format!("{} node runtime ready: {}", workflow_id, node_dir.display()))?;

    let openclaw_dir = install_openclaw(
        &project_root,
        &base_dir,
        &release,
        &install_mode,
        &node_dir,
        remote_base_url,
    )?;
    append_install_log(&base_dir, &format!("{} openclaw installed: {}", workflow_id, openclaw_dir.display()))?;

    let config_path = openclaw_dir.join("openclaw.json");
    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");

    write_installed_manifest(&installed_manifest_path, &InstalledManifest {
        toolkit_version: toolkit_manifest.toolkit_version,
        openclaw_version: release.version.clone(),
        node_version: release.required_node.version.clone(),
        install_mode,
        installed_at: Utc::now().to_rfc3339(),
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        node_dir: node_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        skills: release.skills.clone(),
    })?;

    write_openclaw_config(&config_path, &release, &license.tier, &openclaw_dir, &node_dir)?;
    install_skills(&openclaw_dir, &release.skills)?;
    configure_permissions(&openclaw_dir, &config_path)?;
    configure_browser_runtime()?;
    verify_openclaw_runtime(&config_path)?;

    append_install_log(&base_dir, &format!("{} finished stage1 install", workflow_id))?;

    Ok(Stage1InstallResult {
        workflow_id,
        status: "succeeded".to_string(),
        openclaw_version: release.version,
        node_version: release.required_node.version,
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        node_dir: node_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
    })
}

fn resolve_selected_version(
    default_version: &str,
    selected_version: Option<&str>,
    release_manifest: &crate::core::manifest::models::ReleaseManifest,
) -> anyhow::Result<String> {
    match selected_version {
        Some("latest") => {
            let mut versions = release_manifest
                .releases
                .iter()
                .map(|release| Version::parse(&release.version))
                .collect::<Result<Vec<_>, _>>()?;
            versions.sort();
            versions
                .last()
                .map(|version| version.to_string())
                .ok_or_else(|| anyhow::anyhow!("release manifest is empty"))
        }
        Some(version) => Ok(version.to_string()),
        None => Ok(default_version.to_string()),
    }
}

fn check_environment() -> anyhow::Result<()> {
    if !cfg!(target_os = "windows") {
        anyhow::bail!("Stage 1 当前仅支持 Windows 环境");
    }
    Ok(())
}

fn uuid_like() -> String {
    format!("stage1-{}", Utc::now().timestamp_millis())
}
