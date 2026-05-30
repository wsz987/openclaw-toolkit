use std::path::PathBuf;

use crate::core::{
    openclaw_config::{
        apply_provider_setup, read_openclaw_status, OpenClawStatusSummary, ProviderSetupInput, ProviderSetupResult,
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
pub fn inspect_openclaw_status(config_path: String) -> Result<OpenClawStatusSummary, String> {
    read_openclaw_status(&PathBuf::from(config_path)).map_err(render_error)
}

#[tauri::command]
pub fn setup_openclaw_provider(input: ProviderSetupInput) -> Result<ProviderSetupResult, String> {
    apply_provider_setup(&input).map_err(render_error)
}

#[tauri::command]
pub fn launch_openclaw_runtime(config_path: String) -> Result<ManagedLaunchResponse, String> {
    let status = read_openclaw_status(&PathBuf::from(&config_path)).map_err(render_error)?;
    let launch = launch_managed_openclaw(&status).map_err(render_error)?;
    Ok(map_launch_response(launch))
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
