use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::Context;
use chrono::{DateTime, Utc};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::core::{
    background_process::background_command,
    manifest::{models::InstalledManifest, write_installed_manifest},
    node_runtime::ensure_node_runtime_mirror_config,
    openclaw_config::{read_openclaw_status, OpenClawStatusSummary},
    runtime_host::default_runtime_host_kind,
    runtime_manager::{RuntimeLifecycleState, RuntimeSnapshot},
};

const SETTINGS_SCHEMA_VERSION: u32 = 1;
const REGISTRY_SCHEMA_VERSION: u32 = 1;
const DEFAULT_BASE_DIR: &str = r"D:\OpenClaw";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub last_selected_base_dir: Option<String>,
    pub active_installation_id: Option<String>,
    #[serde(default)]
    pub recent_installation_ids: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            last_selected_base_dir: None,
            active_installation_id: None,
            recent_installation_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationRegistry {
    pub schema_version: u32,
    pub active_installation_id: Option<String>,
    #[serde(default)]
    pub installations: Vec<InstallationRecord>,
}

impl Default for InstallationRegistry {
    fn default() -> Self {
        Self {
            schema_version: REGISTRY_SCHEMA_VERSION,
            active_installation_id: None,
            installations: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationRecord {
    pub installation_id: String,
    pub display_name: String,
    pub base_dir: String,
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    pub installed_manifest_path: String,
    pub install_mode: String,
    pub openclaw_version: String,
    pub node_version: String,
    pub status: String,
    pub config_state: String,
    pub runtime_state: String,
    pub provider_state: String,
    pub panel_state: String,
    #[serde(default)]
    pub runtime_action_required: String,
    #[serde(default)]
    pub pending_config_changes: Vec<String>,
    #[serde(default)]
    pub runtime_pid: Option<u32>,
    #[serde(default)]
    pub runtime_log_path: Option<String>,
    #[serde(default)]
    pub gateway_ready: bool,
    #[serde(default = "default_runtime_host_kind_string")]
    pub runtime_host_kind: String,
    pub installed_at: String,
    pub last_validated_at: Option<String>,
    pub last_launched_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InstallationLifecycleState {
    Installing,
    Installed,
    Degraded,
    Invalid,
}

impl InstallationLifecycleState {
    fn as_str(self) -> &'static str {
        match self {
            InstallationLifecycleState::Installing => "installing",
            InstallationLifecycleState::Installed => "installed",
            InstallationLifecycleState::Degraded => "degraded",
            InstallationLifecycleState::Invalid => "invalid",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrapState {
    pub screen: String,
    pub default_base_dir: String,
    pub settings: AppSettings,
    pub active_installation: Option<InstallationRecord>,
    pub status: Option<OpenClawStatusSummary>,
    pub message: Option<String>,
}

pub fn bootstrap_app_state() -> anyhow::Result<AppBootstrapState> {
    let mut settings = load_app_settings()?;
    let mut registry = load_install_registry()?;
    let registry_changed = discover_installations_from_known_locations(&settings, &mut registry)?;
    let default_base_dir = default_base_dir_string();

    let active_id = settings
        .active_installation_id
        .clone()
        .or_else(|| registry.active_installation_id.clone())
        .or_else(|| {
            registry
                .installations
                .first()
                .map(|item| item.installation_id.clone())
        });

    let Some(active_id) = active_id else {
        return Ok(AppBootstrapState {
            screen: "installer".to_string(),
            default_base_dir,
            settings,
            active_installation: None,
            status: None,
            message: None,
        });
    };

    let Some(index) = registry
        .installations
        .iter()
        .position(|item| item.installation_id == active_id)
    else {
        return Ok(AppBootstrapState {
            screen: "installer".to_string(),
            default_base_dir,
            settings,
            active_installation: None,
            status: None,
            message: None,
        });
    };

    let mut installation = registry.installations[index].clone();
    match validate_installation(&mut installation) {
        Ok(status) => {
            registry.installations[index] = installation.clone();
            registry.active_installation_id = Some(installation.installation_id.clone());
            settings.active_installation_id = Some(installation.installation_id.clone());
            settings.last_selected_base_dir = Some(installation.base_dir.clone());
            touch_recent_installation(&mut settings, &installation.installation_id);
            save_app_settings(&settings)?;
            save_install_registry(&registry)?;

            Ok(AppBootstrapState {
                screen: "installedHome".to_string(),
                default_base_dir,
                settings,
                active_installation: Some(installation),
                status: Some(status),
                message: None,
            })
        }
        Err(error) => {
            let error_text = error.to_string();
            installation.status = "degraded".to_string();
            installation.config_state = "missing".to_string();
            installation.last_error = Some(error_text.clone());
            installation.last_validated_at = Some(Utc::now().to_rfc3339());
            registry.installations[index] = installation.clone();
            if error_text.contains("安装记录丢失") {
                registry.active_installation_id = None;
                settings.active_installation_id = None;
                settings.last_selected_base_dir = Some(installation.base_dir.clone());
                save_app_settings(&settings)?;
                if registry_changed || !registry.installations.is_empty() {
                    save_install_registry(&registry)?;
                }

                return Ok(AppBootstrapState {
                    screen: "installer".to_string(),
                    default_base_dir,
                    settings,
                    active_installation: Some(installation),
                    status: None,
                    message: Some(error_text),
                });
            }

            registry.active_installation_id = Some(installation.installation_id.clone());
            settings.active_installation_id = Some(installation.installation_id.clone());
            settings.last_selected_base_dir = Some(installation.base_dir.clone());
            touch_recent_installation(&mut settings, &installation.installation_id);

            save_app_settings(&settings)?;
            if registry_changed || !registry.installations.is_empty() {
                save_install_registry(&registry)?;
            }

            Ok(AppBootstrapState {
                screen: "recovery".to_string(),
                default_base_dir,
                settings,
                active_installation: Some(installation),
                status: None,
                message: Some(error_text),
            })
        }
    }
}

pub fn import_installation_from_path(selected_path: &Path) -> anyhow::Result<AppBootstrapState> {
    let mut settings = load_app_settings()?;
    let mut registry = load_install_registry()?;
    let manifest_path = resolve_manifest_from_selected_path(selected_path)?;
    let mut manifest = read_json::<InstalledManifest>(&manifest_path)?;
    let base_dir = manifest
        .base_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            infer_base_dir_from_manifest_path(&manifest_path, &manifest.openclaw_dir)
        });

    let mut manifest_changed = false;
    if manifest.installation_id.as_deref().unwrap_or("").is_empty() {
        manifest.installation_id = Some(derive_installation_id(
            Path::new(&base_dir),
            &manifest.openclaw_version,
            &manifest.installed_at,
        ));
        manifest_changed = true;
    }
    if manifest.base_dir.as_deref().unwrap_or("").is_empty() {
        manifest.base_dir = Some(base_dir.clone());
        manifest_changed = true;
    }
    if manifest_changed {
        write_installed_manifest(&manifest_path, &manifest)?;
    }

    let mut record = installation_record_from_manifest(&manifest, &manifest_path, None)?;
    let status = validate_installation(&mut record)?;

    upsert_installation(&mut registry, record.clone());
    registry.active_installation_id = Some(record.installation_id.clone());
    settings.active_installation_id = Some(record.installation_id.clone());
    settings.last_selected_base_dir = Some(record.base_dir.clone());
    touch_recent_installation(&mut settings, &record.installation_id);
    save_app_settings(&settings)?;
    save_install_registry(&registry)?;

    Ok(AppBootstrapState {
        screen: "installedHome".to_string(),
        default_base_dir: default_base_dir_string(),
        settings,
        active_installation: Some(record),
        status: Some(status),
        message: None,
    })
}

pub fn open_control_panel(config_path: &Path) -> anyhow::Result<String> {
    let status = read_openclaw_status(config_path)?;
    let url = status.control_ui_url.clone();

    background_command("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .with_context(|| format!("open control panel {}", url))?;

    Ok(url)
}

pub fn open_installation_directory(path: &Path) -> anyhow::Result<String> {
    open_path_in_explorer(path)?;
    Ok(path.to_string_lossy().to_string())
}

pub fn open_logs_directory(config_path: &Path) -> anyhow::Result<String> {
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let logs_dir = openclaw_dir.join("logs");
    fs::create_dir_all(&logs_dir).with_context(|| format!("create {}", logs_dir.display()))?;
    open_path_in_explorer(&logs_dir)?;
    Ok(logs_dir.to_string_lossy().to_string())
}

pub fn remember_last_selected_base_dir(base_dir: &Path) -> anyhow::Result<()> {
    let mut settings = load_app_settings()?;
    settings.last_selected_base_dir = Some(base_dir.to_string_lossy().to_string());
    save_app_settings(&settings)
}

pub fn register_successful_install(
    manifest: &InstalledManifest,
    installed_manifest_path: &Path,
    status: Option<&OpenClawStatusSummary>,
) -> anyhow::Result<InstallationRecord> {
    let mut settings = load_app_settings()?;
    let mut registry = load_install_registry()?;
    let mut record = installation_record_from_manifest(manifest, installed_manifest_path, status)?;
    record.status = InstallationLifecycleState::Installed.as_str().to_string();
    upsert_installation(&mut registry, record.clone());
    registry.active_installation_id = Some(record.installation_id.clone());
    settings.active_installation_id = Some(record.installation_id.clone());
    settings.last_selected_base_dir = Some(record.base_dir.clone());
    touch_recent_installation(&mut settings, &record.installation_id);
    save_app_settings(&settings)?;
    save_install_registry(&registry)?;
    Ok(record)
}

pub fn prepare_installation_target(base_dir: &Path, openclaw_version: &str) -> anyhow::Result<()> {
    let mut settings = load_app_settings()?;
    let mut registry = load_install_registry()?;
    let target_openclaw_dir = base_dir
        .join("openclaw")
        .join(openclaw_version)
        .to_string_lossy()
        .to_string();

    let mut active_removed = false;
    registry.installations.retain(|item| {
        let same_target = same_path(&item.openclaw_dir, &target_openclaw_dir);
        if !same_target {
            return true;
        }

        let manifest_exists = PathBuf::from(&item.installed_manifest_path).exists();
        let state = infer_lifecycle_state(item, manifest_exists);
        if state == InstallationLifecycleState::Invalid {
            if registry.active_installation_id.as_deref() == Some(&item.installation_id) {
                active_removed = true;
            }
            return false;
        }

        true
    });

    if active_removed {
        registry.active_installation_id = None;
        settings.active_installation_id = None;
    }

    settings.last_selected_base_dir = Some(base_dir.to_string_lossy().to_string());
    save_app_settings(&settings)?;
    save_install_registry(&registry)?;
    Ok(())
}

pub fn sync_installation_status_by_config_path(config_path: &Path) -> anyhow::Result<()> {
    let mut registry = load_install_registry()?;
    let Some(record) = registry
        .installations
        .iter_mut()
        .find(|item| same_path(&item.config_path, config_path))
    else {
        return Ok(());
    };

    let status = resolve_status_for_record(config_path, record)?;
    apply_status_to_record(record, &status);
    save_install_registry(&registry)
}

pub fn resolve_installation_status_by_config_path(
    config_path: &Path,
) -> anyhow::Result<OpenClawStatusSummary> {
    let registry = load_install_registry()?;

    if let Some(record) = registry
        .installations
        .iter()
        .find(|item| same_path(&item.config_path, config_path))
    {
        return resolve_status_for_record(config_path, record);
    }

    read_openclaw_status(config_path)
}

pub fn resolve_runtime_host_kind_by_config_path(config_path: &Path) -> String {
    load_install_registry()
        .ok()
        .and_then(|registry| {
            registry
                .installations
                .into_iter()
                .find(|item| same_path(&item.config_path, config_path))
                .map(|item| item.runtime_host_kind)
        })
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_runtime_host_kind().to_string())
}

pub fn mark_installation_runtime_state(
    config_path: &Path,
    runtime_state: &str,
    runtime_pid: Option<u32>,
    runtime_log_path: Option<&Path>,
    runtime_host_kind: Option<&str>,
) -> anyhow::Result<()> {
    let mut registry = load_install_registry()?;
    let Some(record) = registry
        .installations
        .iter_mut()
        .find(|item| same_path(&item.config_path, config_path))
    else {
        return Ok(());
    };

    record.runtime_state = runtime_state.to_string();
    record.status = "installed".to_string();
    record.runtime_pid = runtime_pid;
    record.runtime_log_path = runtime_log_path.map(|path| path.to_string_lossy().to_string());
    if let Some(runtime_host_kind) = runtime_host_kind
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        record.runtime_host_kind = runtime_host_kind.to_string();
    }
    if runtime_state.eq_ignore_ascii_case("running") {
        record.runtime_action_required = "none".to_string();
        record.pending_config_changes.clear();
        record.last_launched_at = Some(Utc::now().to_rfc3339());
    }
    record.last_error = None;
    save_install_registry(&registry)
}

pub fn apply_runtime_snapshot(
    config_path: &Path,
    snapshot: &RuntimeSnapshot,
) -> anyhow::Result<()> {
    let mut registry = load_install_registry()?;
    let Some(record) = registry
        .installations
        .iter_mut()
        .find(|item| same_path(&item.config_path, config_path))
    else {
        return Ok(());
    };

    record.runtime_state = snapshot.state.as_str().to_string();
    record.runtime_pid = snapshot.pid;
    record.runtime_log_path = snapshot
        .log_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    record.gateway_ready = snapshot.gateway_ready;
    record.runtime_host_kind = "direct-process".to_string();
    record.last_error = snapshot.last_error.clone();
    record.status = if snapshot.state == RuntimeLifecycleState::Failed {
        "degraded".to_string()
    } else {
        "installed".to_string()
    };
    if snapshot.state == RuntimeLifecycleState::Running {
        record.runtime_action_required = "none".to_string();
        record.pending_config_changes.clear();
        record.last_launched_at = Some(Utc::now().to_rfc3339());
    }
    save_install_registry(&registry)
}

pub fn mark_runtime_action_required(
    config_path: &Path,
    action: &str,
    change_key: &str,
) -> anyhow::Result<()> {
    let mut registry = load_install_registry()?;
    let Some(record) = registry
        .installations
        .iter_mut()
        .find(|item| same_path(&item.config_path, config_path))
    else {
        return Ok(());
    };

    record.runtime_action_required = action.to_string();
    if !record
        .pending_config_changes
        .iter()
        .any(|item| item.eq_ignore_ascii_case(change_key))
    {
        record.pending_config_changes.push(change_key.to_string());
    }
    record.last_error = None;
    save_install_registry(&registry)
}

fn validate_installation(record: &mut InstallationRecord) -> anyhow::Result<OpenClawStatusSummary> {
    let manifest_path = PathBuf::from(&record.installed_manifest_path);
    let config_path = PathBuf::from(&record.config_path);
    let openclaw_dir = PathBuf::from(&record.openclaw_dir);

    if !manifest_path.exists() {
        anyhow::bail!("安装记录丢失：{}", manifest_path.display());
    }
    if !openclaw_dir.exists() {
        anyhow::bail!("安装目录不存在：{}", openclaw_dir.display());
    }
    if !config_path.exists() {
        anyhow::bail!("配置文件不存在：{}", config_path.display());
    }

    let status = resolve_status_for_record(&config_path, record)?;
    apply_status_to_record(record, &status);

    // 启动时刷新 node runtime 的国内镜像源配置（.npmrc），
    // 确保后续 npm 操作始终走国内源。失败不阻断启动。
    let node_dir = PathBuf::from(&record.node_dir);
    if node_dir.is_dir() {
        if let Err(error) = ensure_node_runtime_mirror_config(&node_dir) {
            eprintln!(
                "刷新 node runtime 镜像源失败（不阻断启动）：{} - {}",
                node_dir.display(),
                error
            );
        }
    }

    Ok(status)
}

fn infer_lifecycle_state(
    record: &InstallationRecord,
    manifest_exists: bool,
) -> InstallationLifecycleState {
    if !manifest_exists {
        return InstallationLifecycleState::Invalid;
    }

    match record.status.as_str() {
        "installing" => InstallationLifecycleState::Installing,
        "degraded" => InstallationLifecycleState::Degraded,
        _ => InstallationLifecycleState::Installed,
    }
}

fn open_path_in_explorer(path: &Path) -> anyhow::Result<()> {
    Command::new("explorer")
        .arg(path)
        .spawn()
        .with_context(|| format!("open path {}", path.display()))?;
    Ok(())
}

fn discover_installations_from_known_locations(
    settings: &AppSettings,
    registry: &mut InstallationRegistry,
) -> anyhow::Result<bool> {
    let mut changed = false;
    let mut candidates = Vec::new();

    if let Some(base_dir) = settings.last_selected_base_dir.clone() {
        candidates.push(PathBuf::from(base_dir));
    }

    candidates.push(default_base_dir());

    for installation in &registry.installations {
        candidates.push(PathBuf::from(&installation.base_dir));
    }

    dedupe_paths(&mut candidates);
    for base_dir in candidates {
        changed |= discover_installations_in_base_dir(&base_dir, registry)?;
    }

    Ok(changed)
}

fn discover_installations_in_base_dir(
    base_dir: &Path,
    registry: &mut InstallationRegistry,
) -> anyhow::Result<bool> {
    let openclaw_root = base_dir.join("openclaw");
    if !openclaw_root.exists() {
        return Ok(false);
    }

    let mut changed = false;
    for entry in
        fs::read_dir(&openclaw_root).with_context(|| format!("read {}", openclaw_root.display()))?
    {
        let entry = entry?;
        let candidate_dir = entry.path();
        if !candidate_dir.is_dir() {
            continue;
        }

        let manifest_path = candidate_dir.join("installed-manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        let mut manifest = read_json::<InstalledManifest>(&manifest_path)?;
        let mut manifest_changed = false;
        if manifest.installation_id.as_deref().unwrap_or("").is_empty() {
            manifest.installation_id = Some(derive_installation_id(
                base_dir,
                &manifest.openclaw_version,
                &manifest.installed_at,
            ));
            manifest_changed = true;
        }

        if manifest.base_dir.as_deref().unwrap_or("").is_empty() {
            manifest.base_dir = Some(base_dir.to_string_lossy().to_string());
            manifest_changed = true;
        }

        if manifest.schema_version == 0 {
            manifest.schema_version = SETTINGS_SCHEMA_VERSION;
            manifest_changed = true;
        }

        if manifest_changed {
            write_installed_manifest(&manifest_path, &manifest)?;
        }

        let record = installation_record_from_manifest(&manifest, &manifest_path, None)?;
        upsert_installation(registry, record);
        changed = true;
    }

    Ok(changed)
}

fn installation_record_from_manifest(
    manifest: &InstalledManifest,
    installed_manifest_path: &Path,
    status: Option<&OpenClawStatusSummary>,
) -> anyhow::Result<InstallationRecord> {
    let base_dir = manifest
        .base_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| derive_base_dir_from_openclaw_dir(&manifest.openclaw_dir));
    let installation_id = manifest
        .installation_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            derive_installation_id(
                Path::new(&base_dir),
                &manifest.openclaw_version,
                &manifest.installed_at,
            )
        });

    let mut record = InstallationRecord {
        installation_id,
        display_name: format!("OpenClaw {}", manifest.openclaw_version),
        base_dir,
        openclaw_dir: manifest.openclaw_dir.clone(),
        node_dir: manifest.node_dir.clone(),
        config_path: manifest.config_path.clone(),
        installed_manifest_path: installed_manifest_path.to_string_lossy().to_string(),
        install_mode: manifest.install_mode.clone(),
        openclaw_version: manifest.openclaw_version.clone(),
        node_version: manifest.node_version.clone(),
        status: "installed".to_string(),
        config_state: "partial".to_string(),
        runtime_state: "stopped".to_string(),
        provider_state: "uninitialized".to_string(),
        panel_state: "unknown".to_string(),
        runtime_action_required: "none".to_string(),
        pending_config_changes: Vec::new(),
        runtime_pid: None,
        runtime_log_path: None,
        gateway_ready: false,
        runtime_host_kind: default_runtime_host_kind().to_string(),
        installed_at: manifest.installed_at.clone(),
        last_validated_at: None,
        last_launched_at: None,
        last_error: None,
    };

    if let Some(status) = status {
        apply_status_to_record(&mut record, status);
    }

    Ok(record)
}

fn resolve_manifest_from_selected_path(selected_path: &Path) -> anyhow::Result<PathBuf> {
    if selected_path.is_file()
        && selected_path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("installed-manifest.json"))
            .unwrap_or(false)
    {
        return Ok(selected_path.to_path_buf());
    }

    let direct_manifest = selected_path.join("installed-manifest.json");
    if direct_manifest.exists() {
        return Ok(direct_manifest);
    }

    let nested_openclaw_root = selected_path.join("openclaw");
    if nested_openclaw_root.exists() {
        let manifests = collect_manifest_paths(&nested_openclaw_root)?;
        if let Some(path) = pick_latest_manifest(manifests) {
            return Ok(path);
        }
    }

    anyhow::bail!(
        "未在所选目录中找到 installed-manifest.json，请选择 OpenClaw 安装根目录或具体版本目录"
    )
}

fn collect_manifest_paths(openclaw_root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut manifests = Vec::new();
    for entry in
        fs::read_dir(openclaw_root).with_context(|| format!("read {}", openclaw_root.display()))?
    {
        let entry = entry?;
        let candidate = entry.path().join("installed-manifest.json");
        if candidate.exists() {
            manifests.push(candidate);
        }
    }
    Ok(manifests)
}

fn pick_latest_manifest(manifests: Vec<PathBuf>) -> Option<PathBuf> {
    manifests.into_iter().max_by(|left, right| {
        let left_time = fs::metadata(left).and_then(|meta| meta.modified()).ok();
        let right_time = fs::metadata(right).and_then(|meta| meta.modified()).ok();
        left_time.cmp(&right_time)
    })
}

fn apply_status_to_record(record: &mut InstallationRecord, status: &OpenClawStatusSummary) {
    record.status =
        if status.runtime_running || status.runtime_state.eq_ignore_ascii_case("starting") {
            "installed".to_string()
        } else {
            "degraded".to_string()
        };
    record.config_state = "ready".to_string();
    record.provider_state = if status.provider_initialized {
        "ready".to_string()
    } else if status.provider_id.is_some() {
        "partial".to_string()
    } else {
        "uninitialized".to_string()
    };
    record.runtime_state = if status.runtime_state.eq_ignore_ascii_case("starting") {
        "starting".to_string()
    } else if status.runtime_running {
        "running".to_string()
    } else {
        "stopped".to_string()
    };
    if status.runtime_running || status.runtime_state.eq_ignore_ascii_case("starting") {
        record.runtime_pid = status.runtime_pid;
    } else {
        record.runtime_pid = None;
    }
    record.runtime_log_path = status.runtime_log_path.clone();
    record.gateway_ready = status.gateway_ready;
    record.runtime_action_required = if status.runtime_action_required.trim().is_empty() {
        "none".to_string()
    } else {
        status.runtime_action_required.clone()
    };
    record.pending_config_changes = status.pending_config_changes.clone();
    record.panel_state = if status.panel_reachable {
        "available".to_string()
    } else {
        "unavailable".to_string()
    };
    record.last_validated_at = Some(Utc::now().to_rfc3339());
    record.last_error = status.runtime_error.clone();
}

fn resolve_status_for_record(
    config_path: &Path,
    record: &InstallationRecord,
) -> anyhow::Result<OpenClawStatusSummary> {
    let mut status = read_openclaw_status(config_path)?;

    let runtime_state = match record.runtime_state.as_str() {
        "starting" | "running" | "stopping" | "failed" | "stopped" => record.runtime_state.clone(),
        _ => "stopped".to_string(),
    };
    let runtime_active = matches!(runtime_state.as_str(), "starting" | "running" | "stopping");
    status.runtime_state = runtime_state;
    status.runtime_running = runtime_active;
    status.runtime_pid = runtime_active.then_some(record.runtime_pid).flatten();
    status.runtime_log_path = record
        .runtime_log_path
        .clone()
        .or(status.runtime_log_path.clone());
    status.gateway_ready = record.gateway_ready && status.runtime_state == "running";
    status.runtime_error = record.last_error.clone();

    status.runtime_action_required = if record.runtime_action_required.trim().is_empty() {
        "none".to_string()
    } else {
        record.runtime_action_required.clone()
    };
    status.pending_config_changes = record.pending_config_changes.clone();
    Ok(status)
}

fn upsert_installation(registry: &mut InstallationRegistry, record: InstallationRecord) {
    if let Some(index) = registry
        .installations
        .iter()
        .position(|item| item.installation_id == record.installation_id)
    {
        registry.installations[index] = record;
    } else {
        registry.installations.push(record);
        registry
            .installations
            .sort_by(|left, right| compare_installed_at(right, left));
    }
}

fn compare_installed_at(
    left: &InstallationRecord,
    right: &InstallationRecord,
) -> std::cmp::Ordering {
    let left_time = parse_datetime(&left.installed_at);
    let right_time = parse_datetime(&right.installed_at);
    left_time.cmp(&right_time)
}

fn parse_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|item| item.with_timezone(&Utc))
}

fn touch_recent_installation(settings: &mut AppSettings, installation_id: &str) {
    settings
        .recent_installation_ids
        .retain(|item| item != installation_id);
    settings
        .recent_installation_ids
        .insert(0, installation_id.to_string());
    settings.recent_installation_ids.truncate(5);
}

fn derive_base_dir_from_openclaw_dir(openclaw_dir: &str) -> String {
    let path = PathBuf::from(openclaw_dir);
    path.parent()
        .and_then(Path::parent)
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_else(|| DEFAULT_BASE_DIR.to_string())
}

pub fn default_base_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        return PathBuf::from(DEFAULT_BASE_DIR);
    }

    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from(DEFAULT_BASE_DIR))
}

fn default_base_dir_string() -> String {
    default_base_dir().to_string_lossy().to_string()
}

fn infer_base_dir_from_manifest_path(manifest_path: &Path, openclaw_dir: &str) -> String {
    manifest_path
        .parent()
        .and_then(Path::parent)
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_else(|| derive_base_dir_from_openclaw_dir(openclaw_dir))
}

pub fn derive_installation_id(
    base_dir: &Path,
    openclaw_version: &str,
    installed_at: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(base_dir.to_string_lossy().as_bytes());
    hasher.update(openclaw_version.as_bytes());
    hasher.update(installed_at.as_bytes());
    let digest = hasher.finalize();
    format!("inst_{}", hex::encode(&digest[..8]))
}

pub fn load_app_settings() -> anyhow::Result<AppSettings> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    read_json(&path)
}

pub fn save_app_settings(settings: &AppSettings) -> anyhow::Result<()> {
    let path = settings_path()?;
    write_json(&path, settings)
}

pub fn load_install_registry() -> anyhow::Result<InstallationRegistry> {
    let path = registry_path()?;
    if !path.exists() {
        return Ok(InstallationRegistry::default());
    }

    read_json(&path)
}

pub fn save_install_registry(registry: &InstallationRegistry) -> anyhow::Result<()> {
    let path = registry_path()?;
    write_json(&path, registry)
}

fn settings_path() -> anyhow::Result<PathBuf> {
    Ok(app_data_dir()?.join("settings.json"))
}

fn registry_path() -> anyhow::Result<PathBuf> {
    Ok(app_data_dir()?.join("install-registry.json"))
}

pub fn app_data_dir() -> anyhow::Result<PathBuf> {
    let project_dirs = ProjectDirs::from("com", "OpenClaw", "OpenClawToolkit")
        .context("resolve OpenClaw Toolkit app data dir")?;
    let dir = project_dirs.data_local_dir().to_path_buf();
    fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
    Ok(dir)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }

    fs::write(path, serde_json::to_string_pretty(value)?)
        .with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> anyhow::Result<T> {
    let content = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parse {}", path.display()))
}

fn dedupe_paths(paths: &mut Vec<PathBuf>) {
    let mut unique = Vec::new();
    for path in paths.drain(..) {
        if !unique.iter().any(|item: &PathBuf| same_path(item, &path)) {
            unique.push(path);
        }
    }
    paths.extend(unique);
}

fn default_runtime_host_kind_string() -> String {
    default_runtime_host_kind().to_string()
}

fn same_path(left: impl AsRef<Path>, right: impl AsRef<Path>) -> bool {
    left.as_ref()
        .to_string_lossy()
        .eq_ignore_ascii_case(&right.as_ref().to_string_lossy())
}

pub fn unregister_installation(installation_id: &str) -> anyhow::Result<()> {
    let mut settings = load_app_settings()?;
    let mut registry = load_install_registry()?;

    registry
        .installations
        .retain(|item| item.installation_id != installation_id);
    if registry.active_installation_id.as_deref() == Some(installation_id) {
        registry.active_installation_id = registry
            .installations
            .first()
            .map(|item| item.installation_id.clone());
    }

    settings
        .recent_installation_ids
        .retain(|item| item != installation_id);
    if settings.active_installation_id.as_deref() == Some(installation_id) {
        settings.active_installation_id = registry.active_installation_id.clone();
    }

    save_install_registry(&registry)?;
    save_app_settings(&settings)?;
    Ok(())
}
