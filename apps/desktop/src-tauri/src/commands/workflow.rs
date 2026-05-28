use crate::core::workflow::{
    inspect_stage1_dashboard, run_stage1_install, Stage1Dashboard, Stage1InstallInput, Stage1InstallResult,
};

#[tauri::command]
pub fn inspect_stage1_dashboard_command(input: Stage1InstallInput) -> Result<Stage1Dashboard, String> {
    inspect_stage1_dashboard(input).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_stage1_install(input: Stage1InstallInput) -> Result<Stage1InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_stage1_install(input))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
