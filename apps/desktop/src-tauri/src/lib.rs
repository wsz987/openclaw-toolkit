pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_state::bootstrap_app_state_command,
            commands::app_state::import_installation_from_path_command,
            commands::app_state::open_control_panel_command,
            commands::app_state::open_installation_directory_command,
            commands::app_state::open_logs_directory_command,
            commands::workflow::inspect_stage1_dashboard_command,
            commands::workflow::inspect_version_catalog_command,
            commands::workflow::start_stage1_install,
            commands::workflow::read_stage1_install_log_tail_command,
            commands::dialog::pick_directory_dialog,
            commands::dialog::pick_file_dialog,
            commands::post_install::inspect_openclaw_status,
            commands::post_install::setup_openclaw_provider,
            commands::post_install::setup_openclaw_feishu_channel,
            commands::post_install::launch_openclaw_runtime,
            commands::post_install::read_openclaw_runtime_log_tail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
