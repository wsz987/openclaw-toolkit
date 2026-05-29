use std::{fs, path::{Path, PathBuf}};

use anyhow::Context;
use chrono::Utc;
use semver::Version;
use serde::{Deserialize, Serialize};

use crate::core::{
    browser::configure_browser_runtime,
    environment::{validate_windows_environment, windows_environment_status},
    license::verify_offline_license,
    manifest::{
        load_release_manifest, load_toolkit_manifest, load_toolkit_settings, write_installed_manifest,
        models::{InstalledManifest, ReleaseArtifact, ReleaseManifest, ToolkitManifest},
    },
    node_runtime::{ensure_node_runtime, node_runtime_dir, node_runtime_executable, validate_node_executable, validate_required_node},
    openclaw_config::{install_openclaw, openclaw_dir as resolve_openclaw_dir, write_openclaw_config},
    permissions::configure_permissions,
    process::{detect_system_openclaw, verify_openclaw_runtime},
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage1Phase {
    Precheck,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage1StepState {
    Done,
    Current,
    Pending,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage1CheckState {
    Ok,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stage1ProgressState {
    workflow_id: String,
    phase: Stage1Phase,
    current_step: Option<InstallStep>,
    completed_steps: Vec<InstallStep>,
    failed_step: Option<InstallStep>,
    message: Option<String>,
    install_mode: String,
    selected_version: String,
    openclaw_version: Option<String>,
    node_version: Option<String>,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1StepSnapshot {
    pub id: InstallStep,
    pub title: String,
    pub description: String,
    pub state: Stage1StepState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1EnvironmentCheck {
    pub id: String,
    pub label: String,
    pub state: Stage1CheckState,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1Dashboard {
    pub workflow_id: Option<String>,
    pub phase: Stage1Phase,
    pub current_step: Option<InstallStep>,
    pub current_step_label: String,
    pub progress: u8,
    pub completed_steps: Vec<InstallStep>,
    pub failed_step: Option<InstallStep>,
    pub message: Option<String>,
    pub steps: Vec<Stage1StepSnapshot>,
    pub environment: Vec<Stage1EnvironmentCheck>,
    pub install_mode: String,
    pub selected_version: String,
    pub openclaw_version: Option<String>,
    pub node_version: Option<String>,
    pub base_dir: String,
}

const STAGE1_STEPS: [InstallStep; 15] = [
    InstallStep::LoadManifest,
    InstallStep::ValidateLicense,
    InstallStep::CheckEnvironment,
    InstallStep::SelectInstallMode,
    InstallStep::ResolveOpenClawVersion,
    InstallStep::ResolveNodeRuntime,
    InstallStep::InstallNodeRuntime,
    InstallStep::ResolveOpenClawArtifact,
    InstallStep::InstallOpenClaw,
    InstallStep::WriteInstalledManifest,
    InstallStep::GenerateOpenClawConfig,
    InstallStep::InstallSkills,
    InstallStep::ConfigurePermissions,
    InstallStep::ConfigureBrowser,
    InstallStep::VerifyRuntime,
];

pub fn inspect_stage1_dashboard(input: Stage1InstallInput) -> anyhow::Result<Stage1Dashboard> {
    let project_root = PathBuf::from(&input.project_root);
    let base_dir = resolve_base_dir(&project_root, input.base_dir.as_deref());

    if let Some(progress) = read_stage1_progress(&base_dir)? {
        let install_mode = progress.install_mode.clone();
        let selected_version = progress.selected_version.clone();
        let openclaw_version = progress.openclaw_version.clone();
        let toolkit_manifest = load_toolkit_manifest(&project_root).ok();
        let release_manifest = if install_mode == "remote" {
            load_toolkit_settings(&project_root)
                .ok()
                .and_then(|settings| settings.remote_base_url)
                .and_then(|remote_base_url| load_release_manifest_from_remote(&remote_base_url).ok())
        } else {
            load_release_manifest(&project_root).ok()
        };
        let release_manifest_available = release_manifest.is_some();
        let resolved_release = match (&toolkit_manifest, &release_manifest, openclaw_version.as_deref()) {
            (Some(_), Some(release_manifest), Some(openclaw_version)) => release_manifest
                .releases
                .iter()
                .find(|release| release.version == openclaw_version)
                .cloned(),
            _ => None,
        };
        let environment = build_environment_checks(
            &project_root,
            &base_dir,
            input.license_key.as_deref(),
            input.install_mode.as_deref(),
            input.selected_version.as_deref(),
            install_mode.as_str(),
            selected_version.as_str(),
            toolkit_manifest.as_ref(),
            resolved_release.as_ref(),
            release_manifest_available,
        );

        return Ok(build_dashboard(
            &base_dir,
            install_mode.as_str(),
            selected_version.as_str(),
            Some(progress),
            environment,
            None,
            None,
        ));
    }

    let install_mode = input.install_mode.clone().unwrap_or_else(|| "local".to_string());
    let selected_version = input.selected_version.clone().unwrap_or_else(|| "latest".to_string());

    let toolkit_manifest = load_toolkit_manifest(&project_root).ok();
    let toolkit_settings = load_toolkit_settings(&project_root).unwrap_or_default();
    let license = verify_offline_license(input.license_key.as_deref()).ok();

    let release_manifest = if install_mode == "remote" {
        toolkit_settings
            .remote_base_url
            .as_deref()
            .and_then(|remote_base_url| load_release_manifest_from_remote(remote_base_url).ok())
    } else {
        load_release_manifest(&project_root).ok()
    };
    let release_manifest_available = release_manifest.is_some();

    let resolved_release = match (&toolkit_manifest, &release_manifest) {
        (Some(toolkit_manifest), Some(release_manifest)) => resolve_selected_version(
            &toolkit_manifest.default_openclaw_version,
            Some(selected_version.as_str()),
            release_manifest,
        )
        .ok()
        .and_then(|version| release_manifest.releases.iter().find(|release| release.version == version).cloned()),
        _ => None,
    };

    let installed_manifest = resolved_release
        .as_ref()
        .and_then(|release| read_installed_manifest(&resolve_openclaw_dir(&base_dir, release)).ok());

    let environment = build_environment_checks(
        &project_root,
        &base_dir,
        input.license_key.as_deref(),
        input.install_mode.as_deref(),
        input.selected_version.as_deref(),
        install_mode.as_str(),
        selected_version.as_str(),
        toolkit_manifest.as_ref(),
        resolved_release.as_ref(),
        release_manifest_available,
    );

    let precheck_step = infer_precheck_step(
        &project_root,
        input.license_key.as_deref(),
        input.install_mode.as_deref(),
        toolkit_manifest.as_ref(),
        release_manifest.as_ref(),
    );

    let progress_state = if let Some(installed) = installed_manifest {
        Stage1ProgressState {
            workflow_id: "installed".to_string(),
            phase: Stage1Phase::Succeeded,
            current_step: None,
            completed_steps: STAGE1_STEPS.to_vec(),
            failed_step: None,
            message: Some("安装已完成".to_string()),
            install_mode: installed.install_mode,
            selected_version: installed.openclaw_version.clone(),
            openclaw_version: Some(installed.openclaw_version),
            node_version: Some(installed.node_version),
            updated_at: Utc::now().to_rfc3339(),
        }
    } else {
        Stage1ProgressState {
            workflow_id: "precheck".to_string(),
            phase: Stage1Phase::Precheck,
            current_step: precheck_step,
            completed_steps: Vec::new(),
            failed_step: None,
            message: None,
            install_mode,
            selected_version,
            openclaw_version: resolved_release.as_ref().map(|release| release.version.clone()),
            node_version: resolved_release
                .as_ref()
                .map(|release| release.required_node.version.clone()),
            updated_at: Utc::now().to_rfc3339(),
        }
    };

    let progress_install_mode = progress_state.install_mode.clone();
    let progress_selected_version = progress_state.selected_version.clone();

    Ok(build_dashboard(
        &base_dir,
        progress_install_mode.as_str(),
        progress_selected_version.as_str(),
        Some(progress_state),
        environment,
        resolved_release.as_ref(),
        license.as_ref(),
    ))
}

pub fn run_stage1_install(input: Stage1InstallInput) -> anyhow::Result<Stage1InstallResult> {
    let workflow_id = uuid_like();
    let project_root = PathBuf::from(&input.project_root);
    let base_dir = resolve_base_dir(&project_root, input.base_dir.as_deref());
    let install_mode = input.install_mode.unwrap_or_else(|| "local".to_string());
    let selected_version = input.selected_version.unwrap_or_else(|| "latest".to_string());

    let mut progress = Stage1ProgressState {
        workflow_id: workflow_id.clone(),
        phase: Stage1Phase::Running,
        current_step: Some(InstallStep::LoadManifest),
        completed_steps: Vec::new(),
        failed_step: None,
        message: Some(step_title(InstallStep::LoadManifest).to_string()),
        install_mode: install_mode.clone(),
        selected_version: selected_version.clone(),
        openclaw_version: None,
        node_version: None,
        updated_at: Utc::now().to_rfc3339(),
    };

    write_stage1_progress(&base_dir, &progress)?;
    append_install_log(&base_dir, &format!("{} start stage1 install", workflow_id))?;

    let toolkit_manifest = run_step(
        &base_dir,
        &mut progress,
        InstallStep::LoadManifest,
        Some(InstallStep::ValidateLicense),
        || load_toolkit_manifest(&project_root),
    )?;

    let toolkit_settings = load_toolkit_settings(&project_root)?;

    let license = run_step(
        &base_dir,
        &mut progress,
        InstallStep::ValidateLicense,
        Some(InstallStep::CheckEnvironment),
        || verify_offline_license(input.license_key.as_deref()),
    )?;

    if !license.features.iter().any(|feature| feature == "managed-node-runtime") {
        fail_stage1(&base_dir, &mut progress, InstallStep::ValidateLicense, "当前授权不包含 OpenClaw 受管 Node Runtime 能力")?;
        anyhow::bail!("当前授权不包含 OpenClaw 受管 Node Runtime 能力");
    }

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::CheckEnvironment,
        Some(InstallStep::SelectInstallMode),
        || check_environment(&toolkit_manifest),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::SelectInstallMode,
        Some(InstallStep::ResolveOpenClawVersion),
        || Ok(()),
    )?;

    let release_manifest = run_step(
        &base_dir,
        &mut progress,
        InstallStep::ResolveOpenClawVersion,
        Some(InstallStep::ResolveNodeRuntime),
        || {
            if install_mode == "remote" {
                let remote_base_url = toolkit_settings
                    .remote_base_url
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("远程模式未配置远程服务器地址"))?;
                load_release_manifest_from_remote(remote_base_url)
            } else {
                load_release_manifest(&project_root)
            }
        },
    )?;

    let selected_version = resolve_selected_version(
        &toolkit_manifest.default_openclaw_version,
        Some(selected_version.as_str()),
        &release_manifest,
    )?;

    let release = release_manifest
        .releases
        .iter()
        .find(|release| release.version == selected_version)
        .cloned()
        .with_context(|| format!("OpenClaw release {} not found", selected_version))?;
    validate_required_node(&release.required_node)?;

    progress.openclaw_version = Some(release.version.clone());
    progress.node_version = Some(release.required_node.version.clone());
    write_stage1_progress(&base_dir, &progress)?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::ResolveNodeRuntime,
        Some(InstallStep::InstallNodeRuntime),
        || {
            let runtime_dir = node_runtime_dir(&base_dir, &release.required_node);
            let node_exe = node_runtime_executable(&runtime_dir);
            if node_exe.exists() {
                match validate_node_executable(&node_exe, &release.required_node.range) {
                    Ok(version) => append_install_log(&base_dir, &format!("{} node runtime already exists: {} ({})", workflow_id, runtime_dir.display(), version))?,
                    Err(error) => append_install_log(&base_dir, &format!("{} node runtime exists but requires reinstall: {}", workflow_id, error))?,
                }
            }
            Ok(())
        },
    )?;

    let artifact_remote_base_url = if install_mode == "remote" {
        toolkit_settings.remote_base_url.as_deref()
    } else {
        None
    };

    let node_dir = run_step(
        &base_dir,
        &mut progress,
        InstallStep::InstallNodeRuntime,
        Some(InstallStep::ResolveOpenClawArtifact),
        || ensure_node_runtime(&project_root, &base_dir, &release.required_node, artifact_remote_base_url),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::ResolveOpenClawArtifact,
        Some(InstallStep::InstallOpenClaw),
        || {
            let artifact_source = if install_mode == "npm" {
                format!("npm package openclaw@{}", release.version)
            } else if artifact_remote_base_url.is_some() {
                format!("remote artifact {}", release.artifact)
            } else {
                format!("local artifact {}", release.artifact)
            };
            append_install_log(&base_dir, &format!("{} resolved openclaw source: {}", workflow_id, artifact_source))?;
            Ok(())
        },
    )?;

    let target_openclaw_dir = resolve_openclaw_dir(&base_dir, &release);
    if let Some(backup_dir) = backup_existing_dir(&target_openclaw_dir, &base_dir, &format!("openclaw-{}", release.version))? {
        append_install_log(&base_dir, &format!("{} backup existing openclaw to {}", workflow_id, backup_dir.display()))?;
    }

    let openclaw_dir = run_step(
        &base_dir,
        &mut progress,
        InstallStep::InstallOpenClaw,
        Some(InstallStep::WriteInstalledManifest),
        || install_openclaw(&project_root, &base_dir, &release, &install_mode, &node_dir, artifact_remote_base_url),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::WriteInstalledManifest,
        Some(InstallStep::GenerateOpenClawConfig),
        || {
            let config_path = openclaw_dir.join("openclaw.json");
            let installed_manifest_path = openclaw_dir.join("installed-manifest.json");

            write_installed_manifest(&installed_manifest_path, &InstalledManifest {
                toolkit_version: toolkit_manifest.toolkit_version.clone(),
                openclaw_version: release.version.clone(),
                node_version: release.required_node.version.clone(),
                install_mode: install_mode.clone(),
                installed_at: Utc::now().to_rfc3339(),
                openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
                node_dir: node_dir.to_string_lossy().to_string(),
                config_path: config_path.to_string_lossy().to_string(),
                skills: release.skills.clone(),
            })
        },
    )?;

    let config_path = openclaw_dir.join("openclaw.json");
    run_step(
        &base_dir,
        &mut progress,
        InstallStep::GenerateOpenClawConfig,
        Some(InstallStep::InstallSkills),
        || write_openclaw_config(&config_path, &release, &license.tier, &openclaw_dir, &node_dir),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::InstallSkills,
        Some(InstallStep::ConfigurePermissions),
        || install_skills(&openclaw_dir, &release.skills),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::ConfigurePermissions,
        Some(InstallStep::ConfigureBrowser),
        || configure_permissions(&openclaw_dir, &config_path),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::ConfigureBrowser,
        Some(InstallStep::VerifyRuntime),
        || configure_browser_runtime(),
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::VerifyRuntime,
        None,
        || verify_openclaw_runtime(&config_path),
    )?;

    progress.phase = Stage1Phase::Succeeded;
    progress.current_step = None;
    progress.failed_step = None;
    progress.message = Some("安装完成".to_string());
    progress.updated_at = Utc::now().to_rfc3339();
    write_stage1_progress(&base_dir, &progress)?;
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

fn run_step<T>(
    base_dir: &Path,
    progress: &mut Stage1ProgressState,
    step: InstallStep,
    next_step: Option<InstallStep>,
    action: impl FnOnce() -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    progress.phase = Stage1Phase::Running;
    progress.current_step = Some(step);
    progress.message = Some(step_title(step).to_string());
    progress.updated_at = Utc::now().to_rfc3339();
    write_stage1_progress(base_dir, progress)?;

    let result = action();
    match result {
        Ok(value) => {
            if !progress.completed_steps.contains(&step) {
                progress.completed_steps.push(step);
            }
            progress.current_step = next_step;
            progress.failed_step = None;
            progress.message = next_step.map(step_title).map(str::to_string).or_else(|| Some("安装完成".to_string()));
            progress.updated_at = Utc::now().to_rfc3339();
            write_stage1_progress(base_dir, progress)?;
            Ok(value)
        }
        Err(error) => {
            progress.phase = Stage1Phase::Failed;
            progress.current_step = Some(step);
            progress.failed_step = Some(step);
            progress.message = Some(error.to_string());
            progress.updated_at = Utc::now().to_rfc3339();
            write_stage1_progress(base_dir, progress)?;
            Err(error)
        }
    }
}

fn fail_stage1(base_dir: &Path, progress: &mut Stage1ProgressState, step: InstallStep, message: &str) -> anyhow::Result<()> {
    progress.phase = Stage1Phase::Failed;
    progress.current_step = Some(step);
    progress.failed_step = Some(step);
    progress.message = Some(message.to_string());
    progress.updated_at = Utc::now().to_rfc3339();
    write_stage1_progress(base_dir, progress)
}

fn build_dashboard(
    base_dir: &Path,
    install_mode: &str,
    selected_version: &str,
    progress: Option<Stage1ProgressState>,
    environment: Vec<Stage1EnvironmentCheck>,
    resolved_release: Option<&ReleaseArtifact>,
    _license: Option<&crate::core::license::LicensePayload>,
) -> Stage1Dashboard {
    let phase = progress.as_ref().map(|state| state.phase).unwrap_or(Stage1Phase::Precheck);
    let current_step = progress.as_ref().and_then(|state| state.current_step);
    let completed_steps = progress.as_ref().map(|state| state.completed_steps.clone()).unwrap_or_default();
    let failed_step = progress.as_ref().and_then(|state| state.failed_step);
    let progress_value = if matches!(phase, Stage1Phase::Succeeded) {
        100
    } else if completed_steps.is_empty() {
        0
    } else {
        ((completed_steps.len() * 100) / STAGE1_STEPS.len()).min(100) as u8
    };
    let message = progress
        .as_ref()
        .and_then(|state| state.message.clone())
        .or_else(|| environment.iter().find(|check| matches!(check.state, Stage1CheckState::Error)).map(|check| check.detail.clone()));

    let steps = STAGE1_STEPS
        .iter()
        .map(|step| {
            let state = if matches!(phase, Stage1Phase::Succeeded) {
                Stage1StepState::Done
            } else if Some(*step) == failed_step {
                Stage1StepState::Failed
            } else if Some(*step) == current_step {
                Stage1StepState::Current
            } else if completed_steps.contains(step) {
                Stage1StepState::Done
            } else {
                Stage1StepState::Pending
            };

            Stage1StepSnapshot {
                id: *step,
                title: step_title(*step).to_string(),
                description: step_description(*step).to_string(),
                state,
            }
        })
        .collect();

    let current_step_label = match phase {
        Stage1Phase::Succeeded => "安装完成".to_string(),
        Stage1Phase::Failed => current_step
            .map(step_title)
            .map(|title| format!("{} 失败", title))
            .unwrap_or_else(|| "安装失败".to_string()),
        Stage1Phase::Running => current_step
            .map(step_title)
            .map(str::to_string)
            .unwrap_or_else(|| "安装进行中".to_string()),
        Stage1Phase::Precheck => current_step
            .map(step_title)
            .map(|title| format!("预检：{}", title))
            .unwrap_or_else(|| "环境预检通过，等待开始".to_string()),
    };

    Stage1Dashboard {
        workflow_id: progress.as_ref().map(|state| state.workflow_id.clone()),
        phase,
        current_step,
        current_step_label,
        progress: progress_value,
        completed_steps,
        failed_step,
        message,
        steps,
        environment,
        install_mode: install_mode.to_string(),
        selected_version: selected_version.to_string(),
        openclaw_version: progress.as_ref().and_then(|state| state.openclaw_version.clone()).or_else(|| resolved_release.map(|release| release.version.clone())),
        node_version: progress.as_ref().and_then(|state| state.node_version.clone()).or_else(|| resolved_release.map(|release| release.required_node.version.clone())),
        base_dir: base_dir.to_string_lossy().to_string(),
    }
}

fn build_environment_checks(
    project_root: &Path,
    base_dir: &Path,
    license_key: Option<&str>,
    install_mode_override: Option<&str>,
    selected_version_override: Option<&str>,
    install_mode: &str,
    selected_version: &str,
    toolkit_manifest: Option<&ToolkitManifest>,
    resolved_release: Option<&ReleaseArtifact>,
    release_manifest_available: bool,
) -> Vec<Stage1EnvironmentCheck> {
    let toolkit_manifest_path = project_root.join("artifacts").join("toolkit-manifest.json");
    let release_manifest_path = project_root.join("artifacts").join("manifest.json");
    let toolkit_settings_path = project_root.join("artifacts").join("toolkit-settings.json");
    let openclaw_dir = resolved_release.map(|release| base_dir.join("openclaw").join(&release.version));
    let node_dir = resolved_release.map(|release| node_runtime_dir(base_dir, &release.required_node));
    let installed_manifest_path = openclaw_dir.as_ref().map(|dir| dir.join("installed-manifest.json"));
    let config_path = openclaw_dir.as_ref().map(|dir| dir.join("openclaw.json"));
    let windows_status = windows_environment_status(toolkit_manifest);
    let license_ok = verify_offline_license(license_key).is_ok();
    let node_runtime_check = build_node_runtime_check(node_dir.as_deref(), resolved_release);
    let system_openclaw_check = build_system_openclaw_check();

    vec![
        Stage1EnvironmentCheck {
            id: "windows".to_string(),
            label: "Windows 环境".to_string(),
            state: match &windows_status {
                Ok(status) if status.is_supported() => Stage1CheckState::Ok,
                Ok(_) => Stage1CheckState::Error,
                Err(_) => Stage1CheckState::Error,
            },
            detail: windows_status
                .map(|status| status.detail())
                .unwrap_or_else(|error| format!("Windows 环境检查失败：{}", error)),
        },
        Stage1EnvironmentCheck {
            id: "project-root".to_string(),
            label: "项目根目录".to_string(),
            state: if project_root.exists() { Stage1CheckState::Ok } else { Stage1CheckState::Error },
            detail: if project_root.exists() { project_root.display().to_string() } else { format!("未找到项目根目录：{}", project_root.display()) },
        },
        Stage1EnvironmentCheck {
            id: "toolkit-manifest".to_string(),
            label: "Toolkit Manifest".to_string(),
            state: if toolkit_manifest_path.exists() { Stage1CheckState::Ok } else { Stage1CheckState::Warn },
            detail: if toolkit_manifest_path.exists() { toolkit_manifest_path.display().to_string() } else { "缺少 artifacts/toolkit-manifest.json".to_string() },
        },
        Stage1EnvironmentCheck {
            id: "license".to_string(),
            label: "离线授权".to_string(),
            state: if license_ok { Stage1CheckState::Ok } else { Stage1CheckState::Error },
            detail: if license_ok { "授权校验通过".to_string() } else { "激活密钥尚未通过离线验签".to_string() },
        },
        Stage1EnvironmentCheck {
            id: "install-mode".to_string(),
            label: "安装模式".to_string(),
            state: if matches!(install_mode, "local" | "remote" | "npm") { Stage1CheckState::Ok } else { Stage1CheckState::Warn },
            detail: format!("当前模式：{}", install_mode_override.unwrap_or(install_mode)),
        },
        Stage1EnvironmentCheck {
            id: "release-manifest".to_string(),
            label: "制品 Manifest".to_string(),
            state: if release_manifest_available { Stage1CheckState::Ok } else { Stage1CheckState::Warn },
            detail: if install_mode == "remote" {
                if release_manifest_available {
                    "已从内部配置的远程源解析制品清单".to_string()
                } else if toolkit_settings_path.exists() {
                    "远程模式尚未解析到可用制品清单".to_string()
                } else {
                    "远程模式需要先配置内部 settings 的制品源地址".to_string()
                }
            } else if release_manifest_path.exists() {
                release_manifest_path.display().to_string()
            } else {
                "缺少 artifacts/manifest.json".to_string()
            },
        },
        Stage1EnvironmentCheck {
            id: "selected-version".to_string(),
            label: "目标版本".to_string(),
            state: if selected_version_override.unwrap_or(selected_version) == "latest" || !selected_version.is_empty() {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: format!("当前选择：{}", selected_version_override.unwrap_or(selected_version)),
        },
        node_runtime_check,
        system_openclaw_check,
        Stage1EnvironmentCheck {
            id: "openclaw-install".to_string(),
            label: "OpenClaw 安装目录".to_string(),
            state: if installed_manifest_path.as_ref().map(|path| path.exists()).unwrap_or(false) {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: installed_manifest_path
                .as_ref()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|| "尚未安装到目标版本目录".to_string()),
        },
        Stage1EnvironmentCheck {
            id: "config".to_string(),
            label: "openclaw.json".to_string(),
            state: if config_path.as_ref().map(|path| path.exists()).unwrap_or(false) {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: config_path
                .as_ref()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|| "尚未生成配置文件".to_string()),
        },
    ]
}

fn build_node_runtime_check(node_dir: Option<&Path>, resolved_release: Option<&ReleaseArtifact>) -> Stage1EnvironmentCheck {
    let Some(release) = resolved_release else {
        return Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Warn,
            detail: "尚未解析 Node Runtime 版本".to_string(),
        };
    };

    let Some(node_dir) = node_dir else {
        return Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("需要 Node {} ({})", release.required_node.version, release.required_node.range),
        };
    };

    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        return Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("未安装：{}，需要 Node {} ({})", node_dir.display(), release.required_node.version, release.required_node.range),
        };
    }

    match validate_node_executable(&node_exe, &release.required_node.range) {
        Ok(actual) => Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Ok,
            detail: format!("{}，当前版本 {}，要求 {}", node_exe.display(), actual, release.required_node.range),
        },
        Err(error) => Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("{}，{}", node_exe.display(), error),
        },
    }
}

fn build_system_openclaw_check() -> Stage1EnvironmentCheck {
    let detection = detect_system_openclaw();
    match (detection.executable, detection.version, detection.error) {
        (Some(executable), Some(version), _) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("检测到系统 OpenClaw：{}，版本 {}。安装流程仍将使用受管运行环境。", executable.display(), version),
        },
        (Some(executable), None, Some(error)) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("检测到系统 OpenClaw：{}，但读取版本失败：{}。安装流程仍将使用受管运行环境。", executable.display(), error),
        },
        (Some(executable), None, None) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!("检测到系统 OpenClaw：{}。安装流程仍将使用受管运行环境。", executable.display()),
        },
        (None, _, _) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Ok,
            detail: "未检测到 PATH 中的系统 OpenClaw，当前安装将使用受管运行环境。".to_string(),
        },
    }
}

fn infer_precheck_step(
    project_root: &Path,
    license_key: Option<&str>,
    install_mode: Option<&str>,
    toolkit_manifest: Option<&ToolkitManifest>,
    release_manifest: Option<&ReleaseManifest>,
) -> Option<InstallStep> {
    let Some(toolkit_manifest) = toolkit_manifest else {
        return Some(InstallStep::LoadManifest);
    };

    if validate_windows_environment(toolkit_manifest).is_err() {
        return Some(InstallStep::CheckEnvironment);
    }

    if !project_root.exists() {
        return Some(InstallStep::LoadManifest);
    }

    if verify_offline_license(license_key).is_err() {
        return Some(InstallStep::ValidateLicense);
    }

    match install_mode.unwrap_or("local") {
        "local" | "remote" | "npm" => {}
        _ => return Some(InstallStep::SelectInstallMode),
    }

    if release_manifest.is_none() {
        return Some(InstallStep::ResolveOpenClawVersion);
    }

    None
}

fn resolve_base_dir(project_root: &Path, base_dir: Option<&str>) -> PathBuf {
    base_dir.map(PathBuf::from).unwrap_or_else(|| project_root.join("runtime"))
}

fn stage1_status_path(base_dir: &Path) -> PathBuf {
    base_dir.join("logs").join("stage1-status.json")
}

fn write_stage1_progress(base_dir: &Path, progress: &Stage1ProgressState) -> anyhow::Result<()> {
    let path = stage1_status_path(base_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create progress dir {}", parent.display()))?;
    }

    fs::write(&path, serde_json::to_string_pretty(progress)?).with_context(|| format!("write progress {}", path.display()))?;
    Ok(())
}

fn read_stage1_progress(base_dir: &Path) -> anyhow::Result<Option<Stage1ProgressState>> {
    let path = stage1_status_path(base_dir);
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).with_context(|| format!("read progress {}", path.display()))?;
    let progress = serde_json::from_str(&content).with_context(|| format!("parse progress {}", path.display()))?;
    Ok(Some(progress))
}

fn read_installed_manifest(openclaw_dir: &Path) -> anyhow::Result<InstalledManifest> {
    let path = openclaw_dir.join("installed-manifest.json");
    let content = fs::read_to_string(&path).with_context(|| format!("read installed manifest {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parse installed manifest {}", path.display()))
}

fn resolve_selected_version(
    default_version: &str,
    selected_version: Option<&str>,
    release_manifest: &ReleaseManifest,
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

fn check_environment(toolkit_manifest: &ToolkitManifest) -> anyhow::Result<()> {
    validate_windows_environment(toolkit_manifest)
}

fn step_title(step: InstallStep) -> &'static str {
    match step {
        InstallStep::LoadManifest => "加载 Manifest",
        InstallStep::ValidateLicense => "验证授权",
        InstallStep::CheckEnvironment => "检查环境",
        InstallStep::SelectInstallMode => "选择安装模式",
        InstallStep::ResolveOpenClawVersion => "解析 OpenClaw 版本",
        InstallStep::ResolveNodeRuntime => "解析 Node Runtime",
        InstallStep::InstallNodeRuntime => "安装 Node Runtime",
        InstallStep::ResolveOpenClawArtifact => "解析 OpenClaw 制品",
        InstallStep::InstallOpenClaw => "安装 OpenClaw",
        InstallStep::WriteInstalledManifest => "写入安装记录",
        InstallStep::GenerateOpenClawConfig => "生成 OpenClaw 配置",
        InstallStep::InstallSkills => "安装 Skills",
        InstallStep::ConfigurePermissions => "配置权限",
        InstallStep::ConfigureBrowser => "配置浏览器运行环境",
        InstallStep::VerifyRuntime => "验证运行环境",
    }
}

fn step_description(step: InstallStep) -> &'static str {
    match step {
        InstallStep::LoadManifest => "读取工具包和制品清单",
        InstallStep::ValidateLicense => "校验离线激活密钥和功能范围",
        InstallStep::CheckEnvironment => "确认当前系统满足安装前提",
        InstallStep::SelectInstallMode => "确认本地、远程或 npm 安装模式",
        InstallStep::ResolveOpenClawVersion => "选出当前要安装的 OpenClaw 版本",
        InstallStep::ResolveNodeRuntime => "计算受管 Node Runtime 目标目录",
        InstallStep::InstallNodeRuntime => "下载或解压 Node Runtime",
        InstallStep::ResolveOpenClawArtifact => "确定 OpenClaw 制品来源",
        InstallStep::InstallOpenClaw => "下载安装到目标目录",
        InstallStep::WriteInstalledManifest => "记录本机安装结果",
        InstallStep::GenerateOpenClawConfig => "生成 openclaw.json 配置文件",
        InstallStep::InstallSkills => "写入并同步技能资源",
        InstallStep::ConfigurePermissions => "应用文件与命令白名单",
        InstallStep::ConfigureBrowser => "确认浏览器运行环境可用",
        InstallStep::VerifyRuntime => "执行最终运行校验",
    }
}

fn uuid_like() -> String {
    format!("stage1-{}", Utc::now().timestamp_millis())
}
