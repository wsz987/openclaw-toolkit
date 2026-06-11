use std::path::PathBuf;

use anyhow::Context;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;

use crate::core::{
    app_state::{
        mark_installation_runtime_state, mark_runtime_action_required,
        resolve_installation_status_by_config_path,
    },
    openclaw_config::{
        apply_feishu_channel_setup, apply_provider_setup, read_openclaw_status,
        test_provider_connection, FeishuChannelSetupInput, FeishuChannelSetupResult,
        OpenClawStatusSummary, ProviderConnectionTestInput, ProviderConnectionTestResult,
        ProviderSetupInput, ProviderSetupResult,
    },
    plugins::{
        install_plugin_from_manifest, PluginInstallInput, PluginInstallProgress,
        PluginInstallResult,
    },
    process::{
        launch_managed_openclaw, stop_managed_openclaw, ManagedOpenClawLaunchResult,
        ManagedOpenClawStopResult,
    },
    skills::{
        inspect_skill_catalog, set_skill_enabled, ManagedSkillCatalog, SkillToggleInput,
        SkillToggleResult,
    },
    status_events::refresh_and_emit_openclaw_status,
    status_watcher::OpenClawStatusWatcher,
};

const FEISHU_PLUGIN_INSTALL_PROGRESS_EVENT: &str = "openclaw://feishu-plugin-install-progress";

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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuAuthQrResult {
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub user_code: String,
    pub expires_in: u64,
    pub interval: u64,
    pub effective_scope: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedLaunchResponse {
    pub pid: u32,
    pub log_path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedStopResponse {
    pub stopped: bool,
}

#[tauri::command]
pub async fn inspect_openclaw_status(
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<OpenClawStatusSummary, String> {
    watcher.watch_config_path(&config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        resolve_installation_status_by_config_path(&config_path).map_err(render_error)
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
                let _ = app.emit(FEISHU_PLUGIN_INSTALL_PROGRESS_EVENT, progress);
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
pub async fn open_external_url_command(
    app: tauri::AppHandle,
    input: OpenExternalUrlInput,
) -> Result<String, String> {
    let url = input.url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("仅支持打开 http/https 链接".to_string());
    }

    app.shell()
        .open(url, None)
        .map_err(|error| error.to_string())?;

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
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
) -> Result<ManagedLaunchResponse, String> {
    watcher.watch_config_path(&config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let status = read_openclaw_status(&PathBuf::from(&config_path))?;
        let launch = launch_managed_openclaw(&status)?;
        let _ = mark_installation_runtime_state(
            &PathBuf::from(&config_path),
            "starting",
            Some(launch.pid),
            Some(&launch.log_path),
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&config_path));
        Ok::<ManagedLaunchResponse, anyhow::Error>(map_launch_response(launch))
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
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
    pid: u32,
) -> Result<ManagedStopResponse, String> {
    watcher.watch_config_path(&config_path);
    tauri::async_runtime::spawn_blocking(move || {
        let result = stop_managed_openclaw(pid)?;
        let _ =
            mark_installation_runtime_state(&PathBuf::from(&config_path), "stopped", None, None);
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&config_path));
        Ok::<ManagedStopResponse, anyhow::Error>(map_stop_response(result))
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
    watcher: tauri::State<'_, OpenClawStatusWatcher>,
    config_path: String,
    pid: Option<u32>,
) -> Result<ManagedLaunchResponse, String> {
    watcher.watch_config_path(&config_path);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(pid) = pid {
            let _ = stop_managed_openclaw(pid);
        }

        let status = read_openclaw_status(&PathBuf::from(&config_path))?;
        let launch = launch_managed_openclaw(&status)?;
        let _ = mark_installation_runtime_state(
            &PathBuf::from(&config_path),
            "starting",
            Some(launch.pid),
            Some(&launch.log_path),
        );
        let _ = refresh_and_emit_openclaw_status(&app, &PathBuf::from(&config_path));
        Ok::<ManagedLaunchResponse, anyhow::Error>(map_launch_response(launch))
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("restart_openclaw_runtime join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

fn map_launch_response(launch: ManagedOpenClawLaunchResult) -> ManagedLaunchResponse {
    ManagedLaunchResponse {
        pid: launch.pid,
        log_path: launch.log_path.to_string_lossy().to_string(),
    }
}

fn map_stop_response(result: ManagedOpenClawStopResult) -> ManagedStopResponse {
    ManagedStopResponse {
        stopped: result.stopped,
    }
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
    if !scope.split_whitespace().any(|item| item == "offline_access") {
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
        .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(reqwest::header::AUTHORIZATION, format!("Basic {basic_auth}"))
        .form(&[("client_id", app_id), ("scope", scope.as_str())])
        .send()
        .context("request Feishu device authorization")?;

    let status = response.status();
    let payload: FeishuDeviceAuthorizationResponse = response
        .json()
        .with_context(|| format!("parse Feishu device authorization response: HTTP {}", status))?;

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

    Ok(FeishuAuthQrResult {
        verification_uri,
        verification_uri_complete,
        user_code,
        expires_in: payload.expires_in.unwrap_or(240),
        interval: payload.interval.unwrap_or(5),
        effective_scope: scope,
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
