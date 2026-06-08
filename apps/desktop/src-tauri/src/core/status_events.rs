use std::path::Path;

use tauri::{AppHandle, Emitter};

use crate::core::{
    app_state::resolve_installation_status_by_config_path, openclaw_config::OpenClawStatusSummary,
};

pub const OPENCLAW_STATUS_CHANGED_EVENT: &str = "openclaw://status-changed";

pub fn emit_openclaw_status_changed(
    app: &AppHandle,
    status: &OpenClawStatusSummary,
) -> Result<(), String> {
    app.emit(OPENCLAW_STATUS_CHANGED_EVENT, status)
        .map_err(|error| error.to_string())
}

pub fn refresh_and_emit_openclaw_status(
    app: &AppHandle,
    config_path: &Path,
) -> Result<OpenClawStatusSummary, String> {
    let status =
        resolve_installation_status_by_config_path(config_path).map_err(render_anyhow_error)?;
    emit_openclaw_status_changed(app, &status)?;
    Ok(status)
}

fn render_anyhow_error(error: anyhow::Error) -> String {
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
