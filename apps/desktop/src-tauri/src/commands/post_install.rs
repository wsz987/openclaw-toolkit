use std::path::PathBuf;

use anyhow::Context;
use tauri::Emitter;

use crate::core::{
    app_state::{
        apply_runtime_snapshot, mark_runtime_action_required,
        resolve_installation_status_by_config_path,
    },
    openclaw_config::{
        apply_dingtalk_channel_setup, apply_feishu_channel_setup, apply_provider_setup,
        read_openclaw_status, test_provider_connection, DingtalkChannelSetupInput,
        DingtalkChannelSetupResult, FeishuChannelSetupInput, FeishuChannelSetupResult,
        OpenClawStatusSummary, ProviderConnectionTestInput, ProviderConnectionTestResult,
        ProviderSetupInput, ProviderSetupResult,
    },
    plugins::{
        install_plugin_from_manifest, uninstall_plugin_from_manifest, PluginInstallInput,
        PluginInstallProgress, PluginInstallResult, PluginUninstallInput, PluginUninstallResult,
    },
    qqbot::{
        apply_qqbot_channel_setup, apply_qqbot_channel_toggle, start_qqbot_login_qr,
        wait_for_qqbot_login, QqbotChannelSetupInput, QqbotChannelSetupResult,
        QqbotChannelToggleInput, QqbotChannelToggleResult, QqbotLoginQrStartInput,
        QqbotLoginQrStartResult, QqbotLoginQrWaitInput, QqbotLoginQrWaitResult,
    },
    runtime_manager::{RuntimeManager, RuntimeSnapshot},
    skills::{
        inspect_skill_catalog, set_skill_enabled, ManagedSkillCatalog, SkillToggleInput,
        SkillToggleResult,
    },
    status_events::refresh_and_emit_openclaw_status,
    status_watcher::OpenClawStatusWatcher,
    weixin::{
        apply_weixin_channel_toggle, inspect_weixin_login_status, start_weixin_login_with_qr,
        wait_for_weixin_login, WeixinChannelToggleInput, WeixinChannelToggleResult,
        WeixinLoginQrStartInput, WeixinLoginQrStartResult, WeixinLoginQrWaitInput,
        WeixinLoginQrWaitResult, WeixinLoginStatus,
    },
};

const OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT: &str = "openclaw://plugin-install-progress";
const OPENCLAW_PLUGIN_UNINSTALL_PROGRESS_EVENT: &str = "openclaw://plugin-uninstall-progress";

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalUrlInput {
    pub url: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAuthQrInput {
    pub app_id: String,
    pub app_secret: String,
    pub domain: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAuthQrStatusInput {
    pub app_id: String,
    pub app_secret: String,
    pub domain: String,
    pub device_code: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkAuthQrInput {
    pub config_path: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkAuthQrStatusInput {
    pub config_path: String,
    pub device_code: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAuthQrResult {
    pub device_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub user_code: String,
    pub expires_in: u64,
    pub interval: u64,
    pub effective_scope: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAuthQrStatusResult {
    pub status: String,
    pub detail: Option<String>,
    pub access_token_granted: bool,
    pub refresh_token_granted: bool,
    pub scope: Option<String>,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkAuthQrResult {
    pub device_code: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkAuthQrStatusResult {
    pub status: String,
    pub detail: Option<String>,
}

#[tauri::command]
pub async fn inspect_openclaw_status(
    manager: tauri::State<'_, RuntimeManager>,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<OpenClawStatusSummary, String> {
    watcher.watch_config_path(&config_path);
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let result = (|| -> anyhow::Result<OpenClawStatusSummary> {
            let snapshot = manager.reconcile(&config_path)?;
            apply_runtime_snapshot(&config_path, &snapshot)?;
            resolve_installation_status_by_config_path(&config_path)
        })();
        result.map_err(render_error)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("inspect_openclaw_status join failed:\n{}", rendered);
        rendered
    })?
}

#[tauri::command]
pub async fn setup_openclaw_provider(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: ProviderSetupInput,
) -> Result<ProviderSetupResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_provider_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "provider-config",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<ProviderSetupResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("setup_openclaw_provider join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn test_openclaw_provider_connection(
    input: ProviderConnectionTestInput,
) -> Result<ProviderConnectionTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || test_provider_connection(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!(
                "test_openclaw_provider_connection join failed:\n{}",
                rendered
            );
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn setup_openclaw_feishu_channel(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: FeishuChannelSetupInput,
) -> Result<FeishuChannelSetupResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_feishu_channel_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.feishu",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<FeishuChannelSetupResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("setup_openclaw_feishu_channel join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn setup_openclaw_dingtalk_channel(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: DingtalkChannelSetupInput,
) -> Result<DingtalkChannelSetupResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_dingtalk_channel_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.dingtalk-connector",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<DingtalkChannelSetupResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("setup_openclaw_dingtalk_channel join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn setup_openclaw_qqbot_channel(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: QqbotChannelSetupInput,
) -> Result<QqbotChannelSetupResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_qqbot_channel_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.qqbot",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<QqbotChannelSetupResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("setup_openclaw_qqbot_channel join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn install_openclaw_plugin(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: PluginInstallInput,
) -> Result<PluginInstallResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = install_plugin_from_manifest(
            &PathBuf::from(&input.config_path),
            &input.plugin_id,
            Some(&|progress: &PluginInstallProgress| {
                let _ = app.emit(OPENCLAW_PLUGIN_INSTALL_PROGRESS_EVENT, progress);
            }),
        )?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            &format!("plugins.{}", result.plugin_entry_id),
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<PluginInstallResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("install_openclaw_plugin join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn uninstall_openclaw_plugin(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: PluginUninstallInput,
) -> Result<PluginUninstallResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = uninstall_plugin_from_manifest(
            &PathBuf::from(&input.config_path),
            &input.plugin_id,
            Some(&|progress: &PluginInstallProgress| {
                let _ = app.emit(OPENCLAW_PLUGIN_UNINSTALL_PROGRESS_EVENT, progress);
            }),
        )?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            &format!("plugins.{}", result.plugin_entry_id),
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<PluginUninstallResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("uninstall_openclaw_plugin join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn open_external_url_command(input: OpenExternalUrlInput) -> Result<String, String> {
    let url = input.url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("仅支持打开 http/https 链接".to_string());
    }

    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())?;

    Ok(url.to_string())
}

#[tauri::command]
pub async fn create_feishu_auth_qr_command(
    input: FeishuAuthQrInput,
) -> Result<FeishuAuthQrResult, String> {
    tauri::async_runtime::spawn_blocking(move || create_feishu_auth_qr(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("create_feishu_auth_qr_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn inspect_feishu_auth_qr_status_command(
    input: FeishuAuthQrStatusInput,
) -> Result<FeishuAuthQrStatusResult, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_feishu_auth_qr_status(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!(
                "inspect_feishu_auth_qr_status_command join failed:\n{}",
                rendered
            );
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn create_dingtalk_auth_qr_command(
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: DingtalkAuthQrInput,
) -> Result<DingtalkAuthQrResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || create_dingtalk_auth_qr(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("create_dingtalk_auth_qr_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn inspect_dingtalk_auth_qr_status_command(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: DingtalkAuthQrStatusInput,
) -> Result<DingtalkAuthQrStatusResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = inspect_dingtalk_auth_qr_status(&input)?;
        if result.status == "authorized" {
            let config_path = PathBuf::from(&input.config_path);
            let _ = mark_runtime_action_required(
                &config_path,
                "restart",
                "channels.dingtalk-connector",
            );
            let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        }
        Ok::<DingtalkAuthQrStatusResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "inspect_dingtalk_auth_qr_status_command join failed:\n{}",
            rendered
        );
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn inspect_weixin_login_status_command(
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<WeixinLoginStatus, String> {
    watcher.watch_config_path(&config_path);
    tauri::async_runtime::spawn_blocking(move || {
        inspect_weixin_login_status(&PathBuf::from(config_path)).map_err(render_error)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "inspect_weixin_login_status_command join failed:\n{}",
            rendered
        );
        rendered
    })?
}

#[tauri::command]
pub async fn start_weixin_login_qr_command(
    input: WeixinLoginQrStartInput,
) -> Result<WeixinLoginQrStartResult, String> {
    tauri::async_runtime::spawn_blocking(move || start_weixin_login_with_qr(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("start_weixin_login_qr_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn wait_for_weixin_login_qr_command(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: WeixinLoginQrWaitInput,
) -> Result<WeixinLoginQrWaitResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = wait_for_weixin_login(&input)?;
        if result.connected || result.already_connected {
            let config_path = PathBuf::from(&input.config_path);
            let _ = mark_runtime_action_required(
                &config_path,
                "restart",
                &format!("channels.{}", "openclaw-weixin"),
            );
            let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        }
        Ok::<WeixinLoginQrWaitResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "wait_for_weixin_login_qr_command join failed:\n{}",
            rendered
        );
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn set_weixin_channel_enabled_command(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: WeixinChannelToggleInput,
) -> Result<WeixinChannelToggleResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_weixin_channel_toggle(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.openclaw-weixin",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<WeixinChannelToggleResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "set_weixin_channel_enabled_command join failed:\n{}",
            rendered
        );
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn start_qqbot_login_qr_command(
    input: QqbotLoginQrStartInput,
) -> Result<QqbotLoginQrStartResult, String> {
    tauri::async_runtime::spawn_blocking(move || start_qqbot_login_qr(&input))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("start_qqbot_login_qr_command join failed:\n{}", rendered);
            rendered
        })?
        .map_err(render_error)
}

#[tauri::command]
pub async fn wait_for_qqbot_login_qr_command(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: QqbotLoginQrWaitInput,
) -> Result<QqbotLoginQrWaitResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = wait_for_qqbot_login(&input)?;
        if result.connected {
            let config_path = PathBuf::from(&input.config_path);
            let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        }
        Ok::<QqbotLoginQrWaitResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("wait_for_qqbot_login_qr_command join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn set_qqbot_channel_enabled_command(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: QqbotChannelToggleInput,
) -> Result<QqbotChannelToggleResult, String> {
    watcher.watch_config_path(&input.config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_qqbot_channel_toggle(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.qqbot",
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<QqbotChannelToggleResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!(
            "set_qqbot_channel_enabled_command join failed:\n{}",
            rendered
        );
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn inspect_openclaw_skill_catalog(
    config_path: String,
) -> Result<ManagedSkillCatalog, String> {
    eprintln!("[Skill 管理] 开始读取内置 skill 清单：{}", config_path);
    tauri::async_runtime::spawn_blocking(move || inspect_skill_catalog(&PathBuf::from(config_path)))
        .await
        .map_err(|error| {
            let rendered = error.to_string();
            eprintln!("[Skill 管理] 读取清单任务异常：\n{}", rendered);
            rendered
        })?
        .map(|catalog| {
            eprintln!(
                "[Skill 管理] 清单读取完成：共 {} 个 skill，skills 目录 {}",
                catalog.skills.len(),
                catalog.skills_dir
            );
            catalog
        })
        .map_err(|error| {
            let rendered = render_error(error);
            eprintln!("[Skill 管理] 清单读取失败：\n{}", rendered);
            rendered
        })
}

#[tauri::command]
pub async fn set_openclaw_skill_enabled(
    app: tauri::AppHandle,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    input: SkillToggleInput,
) -> Result<SkillToggleResult, String> {
    watcher.watch_config_path(&input.config_path);
    eprintln!(
        "[Skill 管理] 准备{} skill：{}",
        if input.enabled { "启用" } else { "关闭" },
        input.skill_id
    );
    tauri::async_runtime::spawn_blocking(move || {
        let result = set_skill_enabled(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            &format!("skills.{}", result.skill_id),
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&result.config_path));
        Ok::<SkillToggleResult, anyhow::Error>(result)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("[Skill 管理] 切换任务异常：\n{}", rendered);
        rendered
    })?
    .map(|result| {
        eprintln!(
            "[Skill 管理] skill {} 已{}，配置文件 {}",
            result.skill_id,
            if result.enabled { "启用" } else { "关闭" },
            result.config_path
        );
        result
    })
    .map_err(|error| {
        let rendered = render_error(error);
        eprintln!("[Skill 管理] 切换失败：\n{}", rendered);
        rendered
    })
}

#[tauri::command]
pub async fn launch_openclaw_runtime(
    app: tauri::AppHandle,
    manager: tauri::State<'_, RuntimeManager>,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<RuntimeSnapshot, String> {
    watcher.watch_config_path(&config_path);
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let snapshot = manager.start(&config_path)?;
        apply_runtime_snapshot(&config_path, &snapshot)?;
        let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        Ok::<RuntimeSnapshot, anyhow::Error>(snapshot)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("launch_openclaw_runtime join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn read_openclaw_runtime_log_tail(
    log_path: String,
    max_lines: Option<usize>,
) -> Result<crate::core::install_log::Stage1InstallLogTail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let log_path = PathBuf::from(log_path);
        if !log_path.exists() {
            return Ok(crate::core::install_log::Stage1InstallLogTail {
                path: log_path.to_string_lossy().to_string(),
                lines: Vec::new(),
                truncated: false,
            });
        }

        let content = std::fs::read_to_string(&log_path)
            .map_err(|e| format!("failed to read log file: {e}"))?;
        let max_lines = max_lines.unwrap_or(200).max(1);
        let mut queue = std::collections::VecDeque::with_capacity(max_lines);
        let mut total_lines = 0;

        for line in content.lines() {
            total_lines += 1;
            if queue.len() == max_lines {
                queue.pop_front();
            }
            queue.push_back(line.to_string());
        }

        Ok(crate::core::install_log::Stage1InstallLogTail {
            path: log_path.to_string_lossy().to_string(),
            lines: queue.into_iter().collect(),
            truncated: total_lines > max_lines,
        })
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("read_openclaw_runtime_log_tail join failed:\n{}", rendered);
        rendered
    })?
}

#[tauri::command]
pub async fn stop_openclaw_runtime(
    app: tauri::AppHandle,
    manager: tauri::State<'_, RuntimeManager>,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
    _pid: Option<u32>,
) -> Result<RuntimeSnapshot, String> {
    watcher.watch_config_path(&config_path);
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let snapshot = manager.stop(&config_path)?;
        apply_runtime_snapshot(&config_path, &snapshot)?;
        let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        Ok::<RuntimeSnapshot, anyhow::Error>(snapshot)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("stop_openclaw_runtime join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn restart_openclaw_runtime(
    app: tauri::AppHandle,
    manager: tauri::State<'_, RuntimeManager>,
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
    _pid: Option<u32>,
) -> Result<RuntimeSnapshot, String> {
    watcher.watch_config_path(&config_path);
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let snapshot = manager.restart(&config_path)?;
        apply_runtime_snapshot(&config_path, &snapshot)?;
        let _ = refresh_and_emit_openclaw_status(&app, &config_path);
        Ok::<RuntimeSnapshot, anyhow::Error>(snapshot)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("restart_openclaw_runtime join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[derive(Debug, serde::Deserialize)]
struct FeishuDeviceAuthorizationResponse {
    device_code: Option<String>,
    user_code: Option<String>,
    verification_uri: Option<String>,
    verification_uri_complete: Option<String>,
    expires_in: Option<u64>,
    interval: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct DingtalkRegistrationInitResponse {
    errcode: i64,
    errmsg: Option<String>,
    nonce: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct DingtalkRegistrationBeginResponse {
    errcode: i64,
    errmsg: Option<String>,
    device_code: Option<String>,
    verification_uri_complete: Option<String>,
    interval: Option<u64>,
    expires_in: Option<u64>,
}

#[derive(Debug, serde::Deserialize)]
struct DingtalkRegistrationPollResponse {
    errcode: i64,
    errmsg: Option<String>,
    status: Option<String>,
    fail_reason: Option<String>,
    client_id: Option<serde_json::Value>,
    client_secret: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct FeishuDeviceTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    scope: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

fn create_feishu_auth_qr(input: &FeishuAuthQrInput) -> anyhow::Result<FeishuAuthQrResult> {
    let app_id = input.app_id.trim();
    let app_secret = input.app_secret.trim();
    if app_id.is_empty() {
        anyhow::bail!("请先填写 App ID");
    }
    if app_secret.is_empty() {
        anyhow::bail!("请先填写 App Secret");
    }

    let brand = if input.domain.eq_ignore_ascii_case("lark") {
        "lark"
    } else {
        "feishu"
    };

    let device_authorization_url = if brand == "lark" {
        "https://accounts.larksuite.com/oauth/v1/device_authorization"
    } else {
        "https://accounts.feishu.cn/oauth/v1/device_authorization"
    };

    let mut scope = input.scope.clone().unwrap_or_default().trim().to_string();
    if !scope
        .split_whitespace()
        .any(|item| item == "offline_access")
    {
        scope = if scope.is_empty() {
            "offline_access".to_string()
        } else {
            format!("{scope} offline_access")
        };
    }

    let basic_auth = {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        STANDARD.encode(format!("{app_id}:{app_secret}"))
    };

    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()?;
    let response = client
        .post(device_authorization_url)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Basic {basic_auth}"),
        )
        .form(&[("client_id", app_id), ("scope", scope.as_str())])
        .send()
        .context("request Feishu device authorization")?;

    let status = response.status();
    let body = response
        .text()
        .with_context(|| format!("read Feishu device authorization response: HTTP {}", status))?;
    eprintln!(
        "[Feishu Auth QR] device_authorization {} -> HTTP {} body: {}",
        device_authorization_url, status, body
    );
    let payload: FeishuDeviceAuthorizationResponse =
        serde_json::from_str(&body).with_context(|| {
            format!(
                "parse Feishu device authorization response: HTTP {} body: {}",
                status, body
            )
        })?;

    if let Some(error) = payload.error {
        let description = payload
            .error_description
            .unwrap_or_else(|| "飞书未返回详细错误".to_string());
        anyhow::bail!("{}: {}", error, description);
    }

    let verification_uri = payload
        .verification_uri
        .context("飞书未返回 verification_uri")?;
    let verification_uri_complete = payload
        .verification_uri_complete
        .clone()
        .unwrap_or_else(|| verification_uri.clone());
    let user_code = payload.user_code.context("飞书未返回 user_code")?;
    let device_code = payload.device_code.context("飞书未返回 device_code")?;

    Ok(FeishuAuthQrResult {
        device_code,
        verification_uri,
        verification_uri_complete,
        user_code,
        expires_in: payload.expires_in.unwrap_or(240),
        interval: payload.interval.unwrap_or(5),
        effective_scope: scope,
    })
}

fn inspect_feishu_auth_qr_status(
    input: &FeishuAuthQrStatusInput,
) -> anyhow::Result<FeishuAuthQrStatusResult> {
    let app_id = input.app_id.trim();
    let app_secret = input.app_secret.trim();
    let device_code = input.device_code.trim();
    if app_id.is_empty() {
        anyhow::bail!("请先填写 App ID");
    }
    if app_secret.is_empty() {
        anyhow::bail!("请先填写 App Secret");
    }
    if device_code.is_empty() {
        anyhow::bail!("二维码状态缺少 device code");
    }

    let brand = if input.domain.eq_ignore_ascii_case("lark") {
        "lark"
    } else {
        "feishu"
    };

    let token_urls = if brand == "lark" {
        [
            "https://accounts.larksuite.com/oauth/v1/token",
            "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
        ]
    } else {
        [
            "https://accounts.feishu.cn/oauth/v1/token",
            "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
        ]
    };

    let basic_auth = {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        STANDARD.encode(format!("{app_id}:{app_secret}"))
    };

    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()?;

    let attempts = [
        vec![
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code".to_string(),
            ),
            ("device_code", device_code.to_string()),
            ("client_id", app_id.to_string()),
        ],
        vec![
            ("grant_type", "device_code".to_string()),
            ("device_code", device_code.to_string()),
            ("client_id", app_id.to_string()),
        ],
        vec![
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code".to_string(),
            ),
            ("device_code", device_code.to_string()),
        ],
        vec![
            ("grant_type", "device_code".to_string()),
            ("device_code", device_code.to_string()),
        ],
    ];

    let mut last_pending: Option<FeishuAuthQrStatusResult> = None;
    let mut last_error: Option<anyhow::Error> = None;

    for token_url in token_urls {
        for form in &attempts {
            match post_feishu_device_token_request(&client, token_url, &basic_auth, form) {
                Ok(result) => return Ok(result),
                Err(error) => {
                    let rendered = error.to_string();
                    eprintln!(
                        "[Feishu Auth QR] poll failed via {} with form {:?}: {}",
                        token_url, form, rendered
                    );
                    if rendered.contains("authorization_pending") || rendered.contains("slow_down")
                    {
                        last_pending = Some(FeishuAuthQrStatusResult {
                            status: "pending".to_string(),
                            detail: Some(rendered),
                            access_token_granted: false,
                            refresh_token_granted: false,
                            scope: None,
                            expires_in: None,
                        });
                        continue;
                    }

                    if rendered.contains("expired_token")
                        || rendered.contains("expired device_code")
                        || rendered.contains("invalid_grant")
                    {
                        return Ok(FeishuAuthQrStatusResult {
                            status: "expired".to_string(),
                            detail: Some(rendered),
                            access_token_granted: false,
                            refresh_token_granted: false,
                            scope: None,
                            expires_in: None,
                        });
                    }

                    last_error = Some(error);
                }
            }
        }
    }

    if let Some(pending) = last_pending {
        return Ok(pending);
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("查询二维码授权状态失败")))
}

fn create_dingtalk_auth_qr(input: &DingtalkAuthQrInput) -> anyhow::Result<DingtalkAuthQrResult> {
    if input.config_path.trim().is_empty() {
        anyhow::bail!("缺少 configPath");
    }

    let base_url = std::env::var("DINGTALK_REGISTRATION_BASE_URL")
        .unwrap_or_else(|_| "https://oapi.dingtalk.com".to_string());
    let source = std::env::var("DINGTALK_REGISTRATION_SOURCE")
        .unwrap_or_else(|_| "DING_DWS_CLAW".to_string());

    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()?;

    let init_url = format!("{}/app/registration/init", base_url.trim_end_matches('/'));
    let init_response = client
        .post(&init_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::json!({ "source": source }).to_string())
        .send()
        .context("request DingTalk registration init")?;
    let init_status = init_response.status();
    let init_body = init_response.text().with_context(|| {
        format!(
            "read DingTalk registration init response: HTTP {}",
            init_status
        )
    })?;
    eprintln!(
        "[DingTalk Auth QR] registration init {} -> HTTP {} body: {}",
        init_url, init_status, init_body
    );
    let init_payload: DingtalkRegistrationInitResponse = serde_json::from_str(&init_body)
        .with_context(|| {
            format!(
                "parse DingTalk registration init response: HTTP {} body: {}",
                init_status, init_body
            )
        })?;
    if init_payload.errcode != 0 {
        anyhow::bail!(
            "{}",
            init_payload.errmsg.unwrap_or_else(|| format!(
                "registration init failed (errcode={})",
                init_payload.errcode
            ))
        );
    }
    let nonce = init_payload.nonce.context("钉钉未返回 nonce")?;

    let begin_url = format!("{}/app/registration/begin", base_url.trim_end_matches('/'));
    let begin_response = client
        .post(&begin_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::json!({ "nonce": nonce }).to_string())
        .send()
        .context("request DingTalk registration begin")?;
    let begin_status = begin_response.status();
    let begin_body = begin_response.text().with_context(|| {
        format!(
            "read DingTalk registration begin response: HTTP {}",
            begin_status
        )
    })?;
    eprintln!(
        "[DingTalk Auth QR] registration begin {} -> HTTP {} body: {}",
        begin_url, begin_status, begin_body
    );
    let begin_payload: DingtalkRegistrationBeginResponse = serde_json::from_str(&begin_body)
        .with_context(|| {
            format!(
                "parse DingTalk registration begin response: HTTP {} body: {}",
                begin_status, begin_body
            )
        })?;
    if begin_payload.errcode != 0 {
        anyhow::bail!(
            "{}",
            begin_payload.errmsg.unwrap_or_else(|| format!(
                "registration begin failed (errcode={})",
                begin_payload.errcode
            ))
        );
    }

    Ok(DingtalkAuthQrResult {
        device_code: begin_payload
            .device_code
            .context("钉钉未返回 device_code")?,
        verification_uri_complete: begin_payload
            .verification_uri_complete
            .context("钉钉未返回 verification_uri_complete")?,
        expires_in: begin_payload.expires_in.unwrap_or(7200),
        interval: begin_payload.interval.unwrap_or(3),
    })
}

fn inspect_dingtalk_auth_qr_status(
    input: &DingtalkAuthQrStatusInput,
) -> anyhow::Result<DingtalkAuthQrStatusResult> {
    let config_path = PathBuf::from(&input.config_path);
    let device_code = input.device_code.trim();
    if device_code.is_empty() {
        anyhow::bail!("二维码状态缺少 device code");
    }

    let base_url = std::env::var("DINGTALK_REGISTRATION_BASE_URL")
        .unwrap_or_else(|_| "https://oapi.dingtalk.com".to_string());
    let poll_url = format!("{}/app/registration/poll", base_url.trim_end_matches('/'));
    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .build()?;
    let poll_response = client
        .post(&poll_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::json!({ "device_code": device_code }).to_string())
        .send()
        .context("request DingTalk registration poll")?;
    let poll_status = poll_response.status();
    let poll_body = poll_response.text().with_context(|| {
        format!(
            "read DingTalk registration poll response: HTTP {}",
            poll_status
        )
    })?;
    eprintln!(
        "[DingTalk Auth QR] registration poll {} -> HTTP {} body: {}",
        poll_url, poll_status, poll_body
    );
    let poll_payload: DingtalkRegistrationPollResponse = serde_json::from_str(&poll_body)
        .with_context(|| {
            format!(
                "parse DingTalk registration poll response: HTTP {} body: {}",
                poll_status, poll_body
            )
        })?;
    if poll_payload.errcode != 0 {
        anyhow::bail!(
            "{}",
            poll_payload.errmsg.unwrap_or_else(|| format!(
                "registration poll failed (errcode={})",
                poll_payload.errcode
            ))
        );
    }

    let status = poll_payload
        .status
        .unwrap_or_else(|| "WAITING".to_string())
        .to_ascii_uppercase();
    if status == "WAITING" {
        return Ok(DingtalkAuthQrStatusResult {
            status: "pending".to_string(),
            detail: Some("等待钉钉扫码授权中".to_string()),
        });
    }

    if status == "SUCCESS" {
        let current_status = read_openclaw_status(&config_path)?;
        let current = current_status.dingtalk_channel;
        let client_id = poll_payload
            .client_id
            .as_ref()
            .and_then(|value| {
                value
                    .as_str()
                    .map(ToString::to_string)
                    .or_else(|| value.as_i64().map(|v| v.to_string()))
                    .or_else(|| value.as_u64().map(|v| v.to_string()))
            })
            .filter(|value| !value.trim().is_empty())
            .context("扫码成功但未返回 client_id")?;
        let client_secret = poll_payload
            .client_secret
            .filter(|value| !value.trim().is_empty())
            .context("扫码成功但未返回 client_secret")?;

        let setup_input = DingtalkChannelSetupInput {
            config_path: input.config_path.clone(),
            enabled: current.enabled || current.configured,
            client_id: Some(client_id),
            client_secret: Some(client_secret),
            dm_policy: Some(current.dm_policy),
            allow_from: current.allow_from,
            group_policy: Some(current.group_policy),
            group_allow_from: current.group_allow_from,
            require_mention: current.require_mention,
            streaming: current.streaming,
            typing_indicator: current.typing_indicator,
            resolve_sender_names: current.resolve_sender_names,
            group_reply_mode: Some(current.group_reply_mode),
        };
        let _ = apply_dingtalk_channel_setup(&setup_input)?;

        return Ok(DingtalkAuthQrStatusResult {
            status: "authorized".to_string(),
            detail: Some("钉钉扫码授权已完成，凭证已写入本地配置".to_string()),
        });
    }

    if status == "FAIL" || status == "EXPIRED" {
        return Ok(DingtalkAuthQrStatusResult {
            status: "expired".to_string(),
            detail: Some(
                poll_payload
                    .fail_reason
                    .or(poll_payload.errmsg)
                    .unwrap_or_else(|| "二维码已失效或授权失败".to_string()),
            ),
        });
    }

    Ok(DingtalkAuthQrStatusResult {
        status: "pending".to_string(),
        detail: Some(format!("当前状态：{status}")),
    })
}

fn post_feishu_device_token_request(
    client: &reqwest::blocking::Client,
    token_url: &str,
    basic_auth: &str,
    form: &Vec<(&str, String)>,
) -> anyhow::Result<FeishuAuthQrStatusResult> {
    let response = client
        .post(token_url)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Basic {basic_auth}"),
        )
        .form(form)
        .send()
        .context("request Feishu device token")?;

    let status = response.status();
    let body = response
        .text()
        .with_context(|| format!("read Feishu device token response: HTTP {}", status))?;
    eprintln!(
        "[Feishu Auth QR] token poll {} with form {:?} -> HTTP {} body: {}",
        token_url, form, status, body
    );
    let payload: FeishuDeviceTokenResponse = serde_json::from_str(&body).with_context(|| {
        format!(
            "parse Feishu device token response: HTTP {} body: {}",
            status, body
        )
    })?;

    if let Some(error) = payload.error {
        let description = payload
            .error_description
            .unwrap_or_else(|| "飞书未返回详细错误".to_string());
        anyhow::bail!("{}: {}", error, description);
    }

    Ok(FeishuAuthQrStatusResult {
        status: "authorized".to_string(),
        detail: Some("扫码授权已完成".to_string()),
        access_token_granted: payload.access_token.is_some(),
        refresh_token_granted: payload.refresh_token.is_some(),
        scope: payload.scope,
        expires_in: payload.expires_in,
    })
}

fn render_error(error: anyhow::Error) -> String {
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
