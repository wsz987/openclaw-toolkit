use crate::core::{
    app_state::bootstrap_app_state,
    status_watcher::OpenClawStatusWatcher,
    uninstall::{
        execute_uninstall, inspect_uninstall_plan, ExecuteUninstallInput, UninstallPlan,
        UninstallResult,
    },
};

#[tauri::command]
pub async fn inspect_uninstall_plan_command(
    installation_id: String,
) -> Result<UninstallPlan, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_uninstall_plan(&installation_id))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("inspect_uninstall_plan_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("inspect_uninstall_plan_command failed:\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn execute_uninstall_command(
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: ExecuteUninstallInput,
) -> Result<UninstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || execute_uninstall(input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("execute_uninstall_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(|error| {
            let rendered = render_error_chain(&error);
            eprintln!("execute_uninstall_command failed:\n{}", rendered);
            rendered
        })
        .map(|result| {
            let next_state = bootstrap_app_state().ok();
            if let Some(state) = next_state {
                if let Some(installation) = state.active_installation {
                    watcher.watch_config_path(&installation.config_path);
                } else {
                    watcher.clear_watch_target();
                }
            } else {
                watcher.clear_watch_target();
            }
            result
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
