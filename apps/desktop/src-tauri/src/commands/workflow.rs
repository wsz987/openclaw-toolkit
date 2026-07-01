use std::path::PathBuf;

use crate::core::install_log::{read_stage1_install_log_tail, Stage1InstallLogTail};
use crate::core::version_catalog::{
    inspect_version_catalog, VersionCatalogInput, VersionCatalogResult,
};
use crate::core::workflow::{
    inspect_stage1_dashboard, run_stage1_install, Stage1Dashboard, Stage1InstallInput,
    Stage1InstallResult,
};

#[tauri::command]
pub async fn inspect_install_dashboard_command(
    input: Stage1InstallInput,
) -> Result<Stage1Dashboard, String> {
    inspect_install_dashboard("inspect_install_dashboard_command", input).await
}

#[tauri::command]
pub async fn inspect_stage1_dashboard_command(
    input: Stage1InstallInput,
) -> Result<Stage1Dashboard, String> {
    inspect_install_dashboard("inspect_stage1_dashboard_command", input).await
}

async fn inspect_install_dashboard(
    command_name: &'static str,
    input: Stage1InstallInput,
) -> Result<Stage1Dashboard, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_stage1_dashboard(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("{command_name} join failed:\n{rendered}");
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("{command_name} failed:\n{rendered}");
            rendered
        })
}

#[tauri::command]
pub async fn inspect_version_catalog_command(
    input: VersionCatalogInput,
) -> Result<VersionCatalogResult, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_version_catalog(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("inspect_version_catalog_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("inspect_version_catalog_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn start_openclaw_install(
    input: Stage1InstallInput,
) -> Result<Stage1InstallResult, String> {
    start_install("start_openclaw_install", input).await
}

#[tauri::command]
pub async fn start_stage1_install(
    input: Stage1InstallInput,
) -> Result<Stage1InstallResult, String> {
    start_install("start_stage1_install", input).await
}

async fn start_install(
    command_name: &'static str,
    input: Stage1InstallInput,
) -> Result<Stage1InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_stage1_install(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("{command_name} join failed:\n{rendered}");
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("{command_name} failed:\n{rendered}");
            rendered
        })
}

#[tauri::command]
pub async fn read_install_log_tail_command(
    base_dir: String,
    max_lines: Option<usize>,
) -> Result<Stage1InstallLogTail, String> {
    read_install_log_tail("read_install_log_tail_command", base_dir, max_lines).await
}

#[tauri::command]
pub async fn read_stage1_install_log_tail_command(
    base_dir: String,
    max_lines: Option<usize>,
) -> Result<Stage1InstallLogTail, String> {
    read_install_log_tail(
        "read_stage1_install_log_tail_command",
        base_dir,
        max_lines,
    )
    .await
}

async fn read_install_log_tail(
    command_name: &'static str,
    base_dir: String,
    max_lines: Option<usize>,
) -> Result<Stage1InstallLogTail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_stage1_install_log_tail(&PathBuf::from(base_dir), max_lines.unwrap_or(200))
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("{command_name} join failed:\n{rendered}");
        rendered
    })?
    .map_err(|error| {
        let rendered = render_error_chain(&error);
        eprintln!("{command_name} failed:\n{rendered}");
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
