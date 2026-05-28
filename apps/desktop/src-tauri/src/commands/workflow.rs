use crate::core::workflow::{run_stage1_install, Stage1InstallInput, Stage1InstallResult};

#[tauri::command]
pub fn start_stage1_install(input: Stage1InstallInput) -> Result<Stage1InstallResult, String> {
    run_stage1_install(input).map_err(|error| error.to_string())
}
