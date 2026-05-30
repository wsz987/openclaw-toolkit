pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::workflow::inspect_stage1_dashboard_command,
            commands::workflow::inspect_version_catalog_command,
            commands::workflow::start_stage1_install,
            commands::dialog::pick_directory_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
