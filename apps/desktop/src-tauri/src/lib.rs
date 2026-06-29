pub mod commands;
pub mod core;

use crate::core::status_watcher::OpenClawStatusWatcher;
use std::path::PathBuf;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, MenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_MENU_SHOW_ID: &str = "show-main-window";
const TRAY_MENU_AUTOSTART_ID: &str = "toggle-auto-start";
const TRAY_MENU_EXIT_ID: &str = "exit-application";
const START_HIDDEN_ARG: &str = "--start-hidden";
#[cfg(target_os = "windows")]
const WINDOWS_RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(target_os = "windows")]
const WINDOWS_RUN_VALUE_NAME: &str = "OpenClawToolkit";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let status_watcher = OpenClawStatusWatcher::default();
    status_watcher.bootstrap_active_installation();
    let should_start_hidden = should_start_hidden();

    tauri::Builder::default()
        .manage(status_watcher.clone())
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            if let Ok(resource_dir) = app.path().resource_dir() {
                std::env::set_var("OPENCLAW_TOOLKIT_ROOT", &resource_dir);
            }
            status_watcher.start(app.handle().clone());
            let tray_icon = setup_system_tray(app.handle())?;
            app.manage(tray_icon);

            if should_start_hidden {
                hide_main_window(app.handle())?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
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
            commands::post_install::test_openclaw_provider_connection,
            commands::post_install::setup_openclaw_feishu_channel,
            commands::post_install::setup_openclaw_dingtalk_channel,
            commands::post_install::install_openclaw_plugin,
            commands::post_install::uninstall_openclaw_plugin,
            commands::post_install::open_external_url_command,
            commands::post_install::create_feishu_auth_qr_command,
            commands::post_install::inspect_feishu_auth_qr_status_command,
            commands::post_install::create_dingtalk_auth_qr_command,
            commands::post_install::inspect_dingtalk_auth_qr_status_command,
            commands::post_install::inspect_weixin_login_status_command,
            commands::post_install::start_weixin_login_qr_command,
            commands::post_install::wait_for_weixin_login_qr_command,
            commands::post_install::set_weixin_channel_enabled_command,
            commands::post_install::inspect_openclaw_skill_catalog,
            commands::post_install::set_openclaw_skill_enabled,
            commands::post_install::launch_openclaw_runtime,
            commands::post_install::stop_openclaw_runtime,
            commands::post_install::restart_openclaw_runtime,
            commands::post_install::read_openclaw_runtime_log_tail,
            commands::uninstall::inspect_uninstall_plan_command,
            commands::uninstall::execute_uninstall_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_system_tray(app: &tauri::AppHandle) -> tauri::Result<tauri::tray::TrayIcon> {
    let auto_start_enabled = is_startup_launch_enabled()?;
    let auto_start_item = CheckMenuItem::with_id(
        app,
        TRAY_MENU_AUTOSTART_ID,
        "开机自启",
        true,
        auto_start_enabled,
        None::<&str>,
    )?;
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_MENU_SHOW_ID, "显示主界面")
        .item(&auto_start_item)
        .text(TRAY_MENU_EXIT_ID, "退出应用")
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("openclaw-toolkit-tray")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("OpenClaw Toolkit")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_MENU_AUTOSTART_ID => {
                let _ = toggle_startup_launch(&auto_start_item);
            }
            TRAY_MENU_EXIT_ID => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                let _ = show_main_window(tray.app_handle());
            }
        });

    tray_builder = tray_builder.icon(load_tray_icon()?);

    tray_builder.build(app)
}

fn show_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}

fn load_tray_icon() -> tauri::Result<Image<'static>> {
    Image::from_bytes(include_bytes!("../icons/icon.ico"))
}

fn should_start_hidden() -> bool {
    std::env::args_os().any(|arg| arg == START_HIDDEN_ARG)
}

fn hide_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.hide()?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn is_startup_launch_enabled() -> tauri::Result<bool> {
    let executable_path = std::env::current_exe().map_err(to_setup_error)?;
    let command = build_startup_command(&executable_path);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey(WINDOWS_RUN_KEY_PATH)
        .map_err(to_setup_error)?;

    let existing_value = run_key.get_value::<String, _>(WINDOWS_RUN_VALUE_NAME).ok();
    Ok(existing_value.as_deref() == Some(command.as_str()))
}

#[cfg(not(target_os = "windows"))]
fn is_startup_launch_enabled() -> tauri::Result<bool> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn build_startup_command(executable_path: &PathBuf) -> String {
    format!("\"{}\" {}", executable_path.display(), START_HIDDEN_ARG)
}

#[cfg(target_os = "windows")]
fn set_startup_launch_enabled(enabled: bool) -> tauri::Result<()> {
    let executable_path = std::env::current_exe().map_err(to_setup_error)?;
    let command = build_startup_command(&executable_path);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey(WINDOWS_RUN_KEY_PATH)
        .map_err(to_setup_error)?;

    if enabled {
        run_key
            .set_value(WINDOWS_RUN_VALUE_NAME, &command)
            .map_err(to_setup_error)?;
    } else {
        let _ = run_key.delete_value(WINDOWS_RUN_VALUE_NAME);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_startup_launch_enabled(_enabled: bool) -> tauri::Result<()> {
    Ok(())
}

fn toggle_startup_launch(menu_item: &CheckMenuItem<tauri::Wry>) -> tauri::Result<()> {
    let desired_enabled = menu_item.is_checked()?;
    let set_result = set_startup_launch_enabled(desired_enabled);
    let sync_result = sync_startup_menu_item(menu_item);

    set_result?;
    sync_result.map(|_| ())
}

fn sync_startup_menu_item(menu_item: &CheckMenuItem<tauri::Wry>) -> tauri::Result<bool> {
    let enabled = is_startup_launch_enabled()?;
    menu_item.set_checked(enabled)?;
    Ok(enabled)
}

#[cfg(target_os = "windows")]
fn to_setup_error(error: impl std::error::Error + 'static) -> tauri::Error {
    let boxed: Box<dyn std::error::Error> = Box::new(error);
    tauri::Error::Setup(boxed.into())
}
