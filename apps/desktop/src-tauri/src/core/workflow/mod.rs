use std::{
    env, fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::core::{
    app_state::{
        derive_installation_id, prepare_installation_target, register_successful_install,
        remember_last_selected_base_dir,
    },
    browser::configure_browser_runtime,
    environment::{validate_windows_environment, windows_environment_status},
    license::{
        ensure_install_mode_allowed, ensure_license_feature, verify_offline_license,
    },
    manifest::{
        load_provider_catalog, load_toolkit_manifest, load_toolkit_settings,
        models::{InstalledManifest, ReleaseArtifact, ToolkitManifest},
        write_installed_manifest,
    },
    node_runtime::{
        detect_system_node, ensure_node_runtime, ensure_node_version_matches, node_runtime_dir,
        node_runtime_executable, validate_node_executable, validate_required_node,
    },
    openclaw_config::{
        install_openclaw, openclaw_dir as resolve_openclaw_dir, read_openclaw_status,
        write_openclaw_config,
    },
    permissions::configure_permissions,
    process::{detect_system_openclaw, verify_openclaw_runtime},
    runtime::{append_error_chain_log, append_install_log, backup_existing_dir},
    skills::install_skills,
    version_catalog::{build_version_catalog, resolve_release_for_install},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1InstallInput {
    pub project_root: Option<String>,
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
pub struct SystemOpenClawStatus {
    pub detected: bool,
    pub executable: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1InstallPlan {
    pub target_openclaw_version: Option<String>,
    pub target_node_version: Option<String>,
    pub action: String,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemNodeStatus {
    pub detected: bool,
    pub executable: Option<String>,
    pub version: Option<String>,
    pub satisfies_requirement: Option<bool>,
    pub error: Option<String>,
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
    pub system_openclaw: SystemOpenClawStatus,
    pub system_node: SystemNodeStatus,
    pub install_plan: Stage1InstallPlan,
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
    let project_root = resolve_resource_root(input.project_root.as_deref())?;
    let base_dir = resolve_base_dir(input.base_dir.as_deref());
    let _ = remember_last_selected_base_dir(&base_dir);
    let install_mode = input
        .install_mode
        .clone()
        .unwrap_or_else(|| "local".to_string());
    let selected_version = input
        .selected_version
        .clone()
        .unwrap_or_else(|| "latest".to_string());
    let toolkit_manifest = load_toolkit_manifest(&project_root).ok();
    let license = verify_offline_license(input.license_key.as_deref(), &project_root).ok();
    let version_catalog = build_version_catalog(&project_root, install_mode.as_str());
    let release_manifest_available = version_catalog.source_ready;
    let resolved_release = resolve_release_for_install(
        &project_root,
        install_mode.as_str(),
        selected_version.as_str(),
    )
    .ok();
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
        release_manifest_available,
    );

    if let Some(progress) = read_stage1_progress(&base_dir)? {
        if should_resume_progress(&progress, precheck_step) {
            let progress_install_mode = progress.install_mode.clone();
            let progress_selected_version = progress.selected_version.clone();
            let progress_release = progress.openclaw_version.as_deref().and_then(|version| {
                resolve_release_for_install(&project_root, progress_install_mode.as_str(), version)
                    .ok()
            });

            return Ok(build_dashboard(
                &base_dir,
                progress_install_mode.as_str(),
                progress_selected_version.as_str(),
                Some(progress),
                environment,
                progress_release.as_ref(),
                license.as_ref(),
            ));
        }

        clear_stage1_progress(&base_dir)?;
    }

    let installed_manifest = resolved_release.as_ref().and_then(|release| {
        read_installed_manifest(&resolve_openclaw_dir(&base_dir, release)).ok()
    });

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
            openclaw_version: resolved_release
                .as_ref()
                .map(|release| release.version.clone()),
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
    let project_root = resolve_resource_root(input.project_root.as_deref())?;
    let base_dir = resolve_base_dir(input.base_dir.as_deref());
    remember_last_selected_base_dir(&base_dir)?;
    let install_mode = input.install_mode.unwrap_or_else(|| "local".to_string());
    let selected_version = input
        .selected_version
        .unwrap_or_else(|| "latest".to_string());

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
    let provider_catalog = load_provider_catalog(&project_root).unwrap_or_else(|_| {
        crate::core::manifest::models::ProviderCatalogManifest {
            providers: Vec::new(),
        }
    });

    let license = run_step(
        &base_dir,
        &mut progress,
        InstallStep::ValidateLicense,
        Some(InstallStep::CheckEnvironment),
        || verify_offline_license(input.license_key.as_deref(), &project_root),
    )?;

    if let Err(error) = ensure_license_feature(&license, "managed-node-runtime") {
        fail_stage1(
            &base_dir,
            &mut progress,
            InstallStep::ValidateLicense,
            &error.to_string(),
        )?;
        return Err(error);
    }

    if let Err(error) = ensure_install_mode_allowed(&license, &install_mode) {
        fail_stage1(
            &base_dir,
            &mut progress,
            InstallStep::ValidateLicense,
            &error.to_string(),
        )?;
        return Err(error);
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

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::ResolveOpenClawVersion,
        Some(InstallStep::ResolveNodeRuntime),
        || resolve_release_for_install(&project_root, &install_mode, &selected_version).map(|_| ()),
    )?;
    let release = resolve_release_for_install(&project_root, &install_mode, &selected_version)?;
    validate_required_node(&release.required_node)?;
    prepare_installation_target(&base_dir, &release.version)?;

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
                    Ok(version) => append_install_log(
                        &base_dir,
                        &format!(
                            "{} node runtime already exists: {} ({})",
                            workflow_id,
                            runtime_dir.display(),
                            version
                        ),
                    )?,
                    Err(error) => append_install_log(
                        &base_dir,
                        &format!(
                            "{} node runtime exists but requires reinstall: {}",
                            workflow_id, error
                        ),
                    )?,
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
        || {
            ensure_node_runtime(
                &project_root,
                &base_dir,
                &release.required_node,
                artifact_remote_base_url,
            )
        },
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
            append_install_log(
                &base_dir,
                &format!(
                    "{} resolved openclaw source: {}",
                    workflow_id, artifact_source
                ),
            )?;
            Ok(())
        },
    )?;

    let openclaw_dir = run_step(
        &base_dir,
        &mut progress,
        InstallStep::InstallOpenClaw,
        Some(InstallStep::WriteInstalledManifest),
        || {
            let target_openclaw_dir = resolve_openclaw_dir(&base_dir, &release);
            if let Some(backup_dir) = backup_existing_dir(
                &target_openclaw_dir,
                &base_dir,
                &format!("openclaw-{}", release.version),
            )? {
                append_install_log(
                    &base_dir,
                    &format!(
                        "{} backup existing openclaw to {}",
                        workflow_id,
                        backup_dir.display()
                    ),
                )?;
            }

            install_openclaw(
                &project_root,
                &base_dir,
                &release,
                &install_mode,
                &node_dir,
                artifact_remote_base_url,
                Some(&|message| {
                    let _ = update_step_message(&base_dir, InstallStep::InstallOpenClaw, message);
                }),
            )
        },
    )?;

    run_step(
        &base_dir,
        &mut progress,
        InstallStep::WriteInstalledManifest,
        Some(InstallStep::GenerateOpenClawConfig),
        || {
            let config_path = openclaw_dir.join("openclaw.json");
            let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
            let installed_at = Utc::now().to_rfc3339();
            let installation_id =
                derive_installation_id(&base_dir, &release.version, &installed_at);

            write_installed_manifest(
                &installed_manifest_path,
                &InstalledManifest {
                    schema_version: 1,
                    installation_id: Some(installation_id),
                    toolkit_version: toolkit_manifest.toolkit_version.clone(),
                    openclaw_version: release.version.clone(),
                    node_version: release.required_node.version.clone(),
                    install_mode: install_mode.clone(),
                    installed_at,
                    base_dir: Some(base_dir.to_string_lossy().to_string()),
                    openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
                    node_dir: node_dir.to_string_lossy().to_string(),
                    config_path: config_path.to_string_lossy().to_string(),
                    skills: release.skills.clone(),
                    plugins: Vec::new(),
                },
            )
        },
    )?;

    let config_path = openclaw_dir.join("openclaw.json");
    run_step(
        &base_dir,
        &mut progress,
        InstallStep::GenerateOpenClawConfig,
        Some(InstallStep::InstallSkills),
        || {
            write_openclaw_config(
                &config_path,
                &release,
                &license.tier,
                &openclaw_dir,
                &node_dir,
                &provider_catalog.providers,
            )
        },
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
    append_install_log(
        &base_dir,
        &format!("{} finished stage1 install", workflow_id),
    )?;

    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
    let installed_manifest = read_installed_manifest(&openclaw_dir)?;
    let runtime_status = read_openclaw_status(&config_path).ok();
    let _ = register_successful_install(
        &installed_manifest,
        &installed_manifest_path,
        runtime_status.as_ref(),
    );

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
    append_install_log(
        base_dir,
        &format!("开始执行：{}。{}", step_title(step), step_description(step)),
    )?;

    let result = action();
    match result {
        Ok(value) => {
            if !progress.completed_steps.contains(&step) {
                progress.completed_steps.push(step);
            }
            append_install_log(base_dir, &format!("执行完成：{}", step_title(step)))?;
            if let Some(next_step) = next_step {
                append_install_log(
                    base_dir,
                    &format!("准备进入下一步：{}", step_title(next_step)),
                )?;
            }
            progress.current_step = next_step;
            progress.failed_step = None;
            progress.message = next_step
                .map(step_title)
                .map(str::to_string)
                .or_else(|| Some("安装完成".to_string()));
            progress.updated_at = Utc::now().to_rfc3339();
            write_stage1_progress(base_dir, progress)?;
            Ok(value)
        }
        Err(error) => {
            let error_text = format_error_chain(&error);
            let _ = append_error_chain_log(
                base_dir,
                &format!("步骤失败：{}", step_title(step)),
                &error,
            );
            eprintln!("安装步骤失败：{}\n{}", step_title(step), error_text);
            progress.phase = Stage1Phase::Failed;
            progress.current_step = Some(step);
            progress.failed_step = Some(step);
            progress.message = Some(error_text);
            progress.updated_at = Utc::now().to_rfc3339();
            write_stage1_progress(base_dir, progress)?;
            Err(error)
        }
    }
}

fn fail_stage1(
    base_dir: &Path,
    progress: &mut Stage1ProgressState,
    step: InstallStep,
    message: &str,
) -> anyhow::Result<()> {
    append_install_log(
        base_dir,
        &format!("安装中断：{}。{}", step_title(step), message),
    )?;
    progress.phase = Stage1Phase::Failed;
    progress.current_step = Some(step);
    progress.failed_step = Some(step);
    progress.message = Some(message.to_string());
    progress.updated_at = Utc::now().to_rfc3339();
    write_stage1_progress(base_dir, progress)
}

fn update_step_message(base_dir: &Path, step: InstallStep, message: &str) -> anyhow::Result<()> {
    let Some(mut progress) = read_stage1_progress(base_dir)? else {
        return Ok(());
    };

    if progress.current_step != Some(step) {
        return Ok(());
    }

    progress.message = Some(message.to_string());
    progress.updated_at = Utc::now().to_rfc3339();
    write_stage1_progress(base_dir, &progress)?;
    append_install_log(base_dir, &format!("{}：{}", step_title(step), message))?;
    Ok(())
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
    let phase = progress
        .as_ref()
        .map(|state| state.phase)
        .unwrap_or(Stage1Phase::Precheck);
    let current_step = progress.as_ref().and_then(|state| state.current_step);
    let completed_steps = progress
        .as_ref()
        .map(|state| state.completed_steps.clone())
        .unwrap_or_default();
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
        .or_else(|| {
            environment
                .iter()
                .find(|check| matches!(check.state, Stage1CheckState::Error))
                .map(|check| check.detail.clone())
        });

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

    let system_openclaw = system_openclaw_status();
    let target_openclaw_version = progress
        .as_ref()
        .and_then(|state| state.openclaw_version.clone())
        .or_else(|| resolved_release.map(|release| release.version.clone()));
    let target_node_version = progress
        .as_ref()
        .and_then(|state| state.node_version.clone())
        .or_else(|| resolved_release.map(|release| release.required_node.version.clone()));
    let system_node = system_node_status(resolved_release);
    let install_plan = build_install_plan(
        &system_openclaw,
        target_openclaw_version.clone(),
        target_node_version.clone(),
    );

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
        openclaw_version: target_openclaw_version,
        node_version: target_node_version,
        base_dir: base_dir.to_string_lossy().to_string(),
        system_openclaw,
        system_node,
        install_plan,
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
    let openclaw_dir =
        resolved_release.map(|release| base_dir.join("openclaw").join(&release.version));
    let node_dir =
        resolved_release.map(|release| node_runtime_dir(base_dir, &release.required_node));
    let installed_manifest_path = openclaw_dir
        .as_ref()
        .map(|dir| dir.join("installed-manifest.json"));
    let config_path = openclaw_dir.as_ref().map(|dir| dir.join("openclaw.json"));
    let windows_status = windows_environment_status(toolkit_manifest);
    let license_ok = verify_offline_license(license_key, project_root).is_ok();
    let node_runtime_check = build_node_runtime_check(node_dir.as_deref(), resolved_release);
    let system_node_check = build_system_node_check(resolved_release);
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
            id: "resource-root".to_string(),
            label: "安装资源目录".to_string(),
            state: if project_root.exists() {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Error
            },
            detail: if project_root.exists() {
                project_root.display().to_string()
            } else {
                format!("未找到安装资源目录：{}", project_root.display())
            },
        },
        Stage1EnvironmentCheck {
            id: "toolkit-manifest".to_string(),
            label: "Toolkit Manifest".to_string(),
            state: if toolkit_manifest_path.exists() {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: if toolkit_manifest_path.exists() {
                toolkit_manifest_path.display().to_string()
            } else {
                "缺少 artifacts/toolkit-manifest.json".to_string()
            },
        },
        Stage1EnvironmentCheck {
            id: "license".to_string(),
            label: "离线授权".to_string(),
            state: if license_ok {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Error
            },
            detail: if license_ok {
                "授权校验通过".to_string()
            } else {
                "激活码或授权文件尚未通过离线验签".to_string()
            },
        },
        Stage1EnvironmentCheck {
            id: "install-mode".to_string(),
            label: "安装模式".to_string(),
            state: if matches!(install_mode, "local" | "remote" | "npm") {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: format!(
                "当前模式：{}",
                install_mode_override.unwrap_or(install_mode)
            ),
        },
        Stage1EnvironmentCheck {
            id: "release-manifest".to_string(),
            label: "制品 Manifest".to_string(),
            state: if release_manifest_available {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
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
            state: if selected_version_override.unwrap_or(selected_version) == "latest"
                || !selected_version.is_empty()
            {
                Stage1CheckState::Ok
            } else {
                Stage1CheckState::Warn
            },
            detail: format!(
                "当前选择：{}",
                selected_version_override.unwrap_or(selected_version)
            ),
        },
        node_runtime_check,
        system_node_check,
        system_openclaw_check,
        Stage1EnvironmentCheck {
            id: "openclaw-install".to_string(),
            label: "OpenClaw 安装目录".to_string(),
            state: if installed_manifest_path
                .as_ref()
                .map(|path| path.exists())
                .unwrap_or(false)
            {
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
            state: if config_path
                .as_ref()
                .map(|path| path.exists())
                .unwrap_or(false)
            {
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

fn build_node_runtime_check(
    node_dir: Option<&Path>,
    resolved_release: Option<&ReleaseArtifact>,
) -> Stage1EnvironmentCheck {
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
            detail: format!(
                "需要 Node {} ({})",
                release.required_node.version, release.required_node.range
            ),
        };
    };

    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        return Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "未安装：{}，需要 Node {} ({})",
                node_dir.display(),
                release.required_node.version,
                release.required_node.range
            ),
        };
    }

    match validate_node_executable(&node_exe, &release.required_node.range) {
        Ok(actual) => Stage1EnvironmentCheck {
            id: "node-runtime".to_string(),
            label: "受管 Node Runtime".to_string(),
            state: Stage1CheckState::Ok,
            detail: format!(
                "{}，当前版本 {}，要求 {}",
                node_exe.display(),
                actual,
                release.required_node.range
            ),
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
    match (
        detection.executable.as_ref(),
        detection.version.as_ref(),
        detection.error.as_ref(),
    ) {
        (Some(executable), Some(version), _) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "检测到系统 OpenClaw：{}，版本 {}。安装流程仍将使用受管运行环境。",
                executable.display(),
                version
            ),
        },
        (Some(executable), None, Some(error)) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "检测到系统 OpenClaw：{}，但读取版本失败：{}。安装流程仍将使用受管运行环境。",
                executable.display(),
                error
            ),
        },
        (Some(executable), None, None) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "检测到系统 OpenClaw：{}。安装流程仍将使用受管运行环境。",
                executable.display()
            ),
        },
        (None, _, _) => Stage1EnvironmentCheck {
            id: "system-openclaw".to_string(),
            label: "系统 OpenClaw".to_string(),
            state: Stage1CheckState::Ok,
            detail: "未检测到 PATH 中的系统 OpenClaw，当前安装将使用受管运行环境。".to_string(),
        },
    }
}

fn build_system_node_check(resolved_release: Option<&ReleaseArtifact>) -> Stage1EnvironmentCheck {
    let detection = detect_system_node();
    let requirement = resolved_release.map(|release| release.required_node.range.as_str());

    match (
        detection.executable.as_ref(),
        detection.version.as_ref(),
        detection.error.as_ref(),
        requirement,
    ) {
        (Some(executable), Some(version), _, Some(range)) => {
            let satisfies = ensure_node_version_matches(version, range).is_ok();
            Stage1EnvironmentCheck {
                id: "system-node".to_string(),
                label: "系统 Node.js".to_string(),
                state: if satisfies {
                    Stage1CheckState::Ok
                } else {
                    Stage1CheckState::Warn
                },
                detail: if satisfies {
                    format!("检测到系统 Node：{}，版本 {}，满足要求 {}。安装流程仍优先使用受管 Node Runtime。", executable.display(), version, range)
                } else {
                    format!("检测到系统 Node：{}，版本 {}，不满足要求 {}。安装流程将继续安装受管 Node Runtime。", executable.display(), version, range)
                },
            }
        }
        (Some(executable), Some(version), _, None) => Stage1EnvironmentCheck {
            id: "system-node".to_string(),
            label: "系统 Node.js".to_string(),
            state: Stage1CheckState::Ok,
            detail: format!(
                "检测到系统 Node：{}，版本 {}。",
                executable.display(),
                version
            ),
        },
        (Some(executable), None, Some(error), _) => Stage1EnvironmentCheck {
            id: "system-node".to_string(),
            label: "系统 Node.js".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "检测到系统 Node：{}，但读取版本失败：{}。安装流程仍将使用受管 Node Runtime。",
                executable.display(),
                error
            ),
        },
        (Some(executable), None, None, _) => Stage1EnvironmentCheck {
            id: "system-node".to_string(),
            label: "系统 Node.js".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "检测到系统 Node：{}。安装流程仍将使用受管 Node Runtime。",
                executable.display()
            ),
        },
        (None, _, _, Some(range)) => Stage1EnvironmentCheck {
            id: "system-node".to_string(),
            label: "系统 Node.js".to_string(),
            state: Stage1CheckState::Warn,
            detail: format!(
                "未检测到系统 Node。安装流程将安装受管 Node Runtime，要求 {}。",
                range
            ),
        },
        (None, _, _, None) => Stage1EnvironmentCheck {
            id: "system-node".to_string(),
            label: "系统 Node.js".to_string(),
            state: Stage1CheckState::Warn,
            detail: "未检测到系统 Node。".to_string(),
        },
    }
}

fn system_openclaw_status() -> SystemOpenClawStatus {
    let detection = detect_system_openclaw();

    SystemOpenClawStatus {
        detected: detection.executable.is_some(),
        executable: detection
            .executable
            .map(|path| path.to_string_lossy().to_string()),
        version: detection.version,
        error: detection.error,
    }
}

fn system_node_status(resolved_release: Option<&ReleaseArtifact>) -> SystemNodeStatus {
    let detection = detect_system_node();
    let requirement = resolved_release.map(|release| release.required_node.range.as_str());
    let satisfies_requirement = match (detection.version.as_ref(), requirement) {
        (Some(version), Some(range)) => Some(ensure_node_version_matches(version, range).is_ok()),
        _ => None,
    };

    SystemNodeStatus {
        detected: detection.executable.is_some(),
        executable: detection
            .executable
            .map(|path| path.to_string_lossy().to_string()),
        version: detection.version.map(|version| version.to_string()),
        satisfies_requirement,
        error: detection.error,
    }
}

fn build_install_plan(
    system_openclaw: &SystemOpenClawStatus,
    target_openclaw_version: Option<String>,
    target_node_version: Option<String>,
) -> Stage1InstallPlan {
    let action = match (&system_openclaw.version, target_openclaw_version.as_deref()) {
        (Some(current), Some(target)) if current == target => "reinstall".to_string(),
        (Some(_), Some(_)) => "upgrade".to_string(),
        (Some(_), None) => "upgrade".to_string(),
        (None, _) if system_openclaw.detected => "install".to_string(),
        _ => "install".to_string(),
    };

    Stage1InstallPlan {
        target_openclaw_version,
        target_node_version,
        action,
        requires_confirmation: system_openclaw.detected,
    }
}

fn infer_precheck_step(
    project_root: &Path,
    license_key: Option<&str>,
    install_mode: Option<&str>,
    toolkit_manifest: Option<&ToolkitManifest>,
    release_manifest_available: bool,
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

    if verify_offline_license(license_key, project_root).is_err() {
        return Some(InstallStep::ValidateLicense);
    }

    match install_mode.unwrap_or("local") {
        "local" | "remote" | "npm" => {}
        _ => return Some(InstallStep::SelectInstallMode),
    }

    if !release_manifest_available {
        return Some(InstallStep::ResolveOpenClawVersion);
    }

    None
}

fn resolve_base_dir(base_dir: Option<&str>) -> PathBuf {
    base_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"D:\OpenClaw"))
}

fn resolve_resource_root(project_root: Option<&str>) -> anyhow::Result<PathBuf> {
    if let Some(project_root) = project_root {
        let candidate = PathBuf::from(project_root);
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    if let Ok(explicit_root) = env::var("OPENCLAW_TOOLKIT_ROOT") {
        let candidate = PathBuf::from(explicit_root);
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    for candidate in resource_root_candidates() {
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    anyhow::bail!(
        "未找到安装资源目录：需要存在 artifacts/toolkit-manifest.json 和 artifacts/providers.json"
    )
}

fn resource_root_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        candidates.extend(path_with_ancestors(current_dir, 5));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend(path_with_ancestors(exe_dir.to_path_buf(), 6));
        }
    }

    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique
            .iter()
            .any(|existing: &PathBuf| existing == &candidate)
        {
            unique.push(candidate);
        }
    }

    unique
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

fn has_toolkit_manifest(root: &Path) -> bool {
    root.join("artifacts")
        .join("toolkit-manifest.json")
        .exists()
        && root.join("artifacts").join("providers.json").exists()
}

fn stage1_status_path(base_dir: &Path) -> PathBuf {
    base_dir.join("logs").join("stage1-status.json")
}

fn write_stage1_progress(base_dir: &Path, progress: &Stage1ProgressState) -> anyhow::Result<()> {
    let path = stage1_status_path(base_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create progress dir {}", parent.display()))?;
    }

    fs::write(&path, serde_json::to_string_pretty(progress)?)
        .with_context(|| format!("write progress {}", path.display()))?;
    Ok(())
}

fn read_stage1_progress(base_dir: &Path) -> anyhow::Result<Option<Stage1ProgressState>> {
    let path = stage1_status_path(base_dir);
    if !path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&path).with_context(|| format!("read progress {}", path.display()))?;
    let progress = serde_json::from_str(&content)
        .with_context(|| format!("parse progress {}", path.display()))?;
    Ok(Some(progress))
}

fn clear_stage1_progress(base_dir: &Path) -> anyhow::Result<()> {
    let path = stage1_status_path(base_dir);
    if path.exists() {
        fs::remove_file(&path).with_context(|| format!("remove progress {}", path.display()))?;
    }
    Ok(())
}

fn read_installed_manifest(openclaw_dir: &Path) -> anyhow::Result<InstalledManifest> {
    let path = openclaw_dir.join("installed-manifest.json");
    let content = fs::read_to_string(&path)
        .with_context(|| format!("read installed manifest {}", path.display()))?;
    serde_json::from_str(&content)
        .with_context(|| format!("parse installed manifest {}", path.display()))
}

fn check_environment(toolkit_manifest: &ToolkitManifest) -> anyhow::Result<()> {
    validate_windows_environment(toolkit_manifest)
}

fn should_resume_progress(
    progress: &Stage1ProgressState,
    precheck_step: Option<InstallStep>,
) -> bool {
    match progress.phase {
        Stage1Phase::Running | Stage1Phase::Succeeded => true,
        Stage1Phase::Failed => match (progress.failed_step, precheck_step) {
            (Some(failed_step), Some(current_step)) => {
                step_position(current_step) <= step_position(failed_step)
            }
            _ => false,
        },
        Stage1Phase::Precheck => false,
    }
}

fn step_position(step: InstallStep) -> usize {
    STAGE1_STEPS
        .iter()
        .position(|candidate| *candidate == step)
        .unwrap_or(STAGE1_STEPS.len())
}

fn format_error_chain(error: &anyhow::Error) -> String {
    let mut parts = Vec::new();

    for (index, cause) in error.chain().enumerate() {
        if index == 0 {
            parts.push(cause.to_string());
        } else {
            parts.push(format!("cause[{index}]: {cause}"));
        }
    }

    parts.join("\n")
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
        InstallStep::ValidateLicense => "校验离线激活码、授权文件和功能范围",
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
