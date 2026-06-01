use std::path::PathBuf;

use crate::core::app_state::{
    bootstrap_app_state, import_installation_from_path, open_control_panel,
    open_installation_directory, open_logs_directory,
};

#[tauri::command]
pub async fn bootstrap_app_state_command(
) -> Result<crate::core::app_state::AppBootstrapState, String> {
    tauri::async_runtime::spawn_blocking(bootstrap_app_state)
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("bootstrap_app_state_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("bootstrap_app_state_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn import_installation_from_path_command(
    path: String,
) -> Result<crate::core::app_state::AppBootstrapState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_installation_from_path(&PathBuf::from(path))
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "import_installation_from_path_command join failed:\n{}",
            rendered
        );
        rendered
    })?
    .map_err(|error| {
        let rendered = render_error_chain(&error);
        eprintln!(
            "import_installation_from_path_command failed:\n{}",
            rendered
        );
        rendered
    })
}

#[tauri::command]
pub async fn open_control_panel_command(config_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || open_control_panel(&PathBuf::from(config_path)))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("open_control_panel_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("open_control_panel_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn open_installation_directory_command(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || open_installation_directory(&PathBuf::from(path)))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!(
                "open_installation_directory_command join failed:\n{}",
                rendered
            );
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("open_installation_directory_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn open_logs_directory_command(config_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || open_logs_directory(&PathBuf::from(config_path)))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("open_logs_directory_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("open_logs_directory_command failed:\n{}", rendered);
            rendered
        })
}

fn render_error_chain(error: &anyhow::Error) -> String {
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
