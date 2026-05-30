use crate::core::workflow::{
    inspect_stage1_dashboard, run_stage1_install, Stage1Dashboard, Stage1InstallInput, Stage1InstallResult,
};
use crate::core::version_catalog::{inspect_version_catalog, VersionCatalogInput, VersionCatalogResult};

#[tauri::command]
pub async fn inspect_stage1_dashboard_command(input: Stage1InstallInput) -> Result<Stage1Dashboard, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_stage1_dashboard(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("inspect_stage1_dashboard_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("inspect_stage1_dashboard_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub fn inspect_version_catalog_command(input: VersionCatalogInput) -> Result<VersionCatalogResult, String> {
    inspect_version_catalog(input).map_err(|error| {
        let rendered = render_error_chain(&error);
        eprintln!("inspect_version_catalog_command failed:\n{}", rendered);
        rendered
    })
}

#[tauri::command]
pub async fn start_stage1_install(input: Stage1InstallInput) -> Result<Stage1InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_stage1_install(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("start_stage1_install join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("start_stage1_install failed:\n{}", rendered);
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
