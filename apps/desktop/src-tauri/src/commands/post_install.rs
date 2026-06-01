use std::path::PathBuf;

use crate::core::{
    app_state::{mark_installation_launched, sync_installation_status_by_config_path},
    openclaw_config::{
        apply_provider_setup, read_openclaw_status, OpenClawStatusSummary, ProviderSetupInput,
        ProviderSetupResult,
    },
    process::{launch_managed_openclaw, ManagedOpenClawLaunchResult},
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedLaunchResponse {
    pub pid: u32,
    pub log_path: String,
}

#[tauri::command]
pub async fn inspect_openclaw_status(config_path: String) -> Result<OpenClawStatusSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let status = read_openclaw_status(&config_path)?;
        let _ = sync_installation_status_by_config_path(&config_path);
        Ok::<OpenClawStatusSummary, anyhow::Error>(status)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("inspect_openclaw_status join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn setup_openclaw_provider(
    input: ProviderSetupInput,
) -> Result<ProviderSetupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_provider_setup(&input)?;
        let _ = sync_installation_status_by_config_path(&PathBuf::from(&result.config_path));
        Ok::<ProviderSetupResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("setup_openclaw_provider join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn launch_openclaw_runtime(config_path: String) -> Result<ManagedLaunchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = read_openclaw_status(&PathBuf::from(&config_path))?;
        let launch = launch_managed_openclaw(&status)?;
        let _ = mark_installation_launched(&PathBuf::from(&config_path));
        Ok::<ManagedLaunchResponse, anyhow::Error>(map_launch_response(launch))
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("launch_openclaw_runtime join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

fn map_launch_response(launch: ManagedOpenClawLaunchResult) -> ManagedLaunchResponse {
    ManagedLaunchResponse {
        pid: launch.pid,
        log_path: launch.log_path.to_string_lossy().to_string(),
    }
}

fn render_error(error: anyhow::Error) -> String {
    error
        .chain()
        .enumerate()
        .map(|(index, cause)| {
            if index == 0 {
                cause.to_string()
            } else {
                format!("cause[{index}]: {cause}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}
