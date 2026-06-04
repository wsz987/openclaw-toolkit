use std::path::PathBuf;

use crate::core::{
    app_state::{
        mark_installation_runtime_state, mark_runtime_action_required,
        resolve_installation_status_by_config_path,
        sync_installation_status_by_config_path,
    },
    openclaw_config::{
        apply_feishu_channel_setup, apply_provider_setup, read_openclaw_status,
        FeishuChannelSetupInput, FeishuChannelSetupResult, OpenClawStatusSummary,
        ProviderSetupInput, ProviderSetupResult,
    },
    process::{
        launch_managed_openclaw, stop_managed_openclaw, ManagedOpenClawLaunchResult,
        ManagedOpenClawStopResult,
    },
};

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
pub async fn inspect_openclaw_status(config_path: String) -> Result<OpenClawStatusSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_path = PathBuf::from(config_path);
        let _ = sync_installation_status_by_config_path(&config_path);
        let status = resolve_installation_status_by_config_path(&config_path)?;
        Ok::<OpenClawStatusSummary, anyhow::Error>(status)
    })
    .await
    .map_err(|error| {
        let rendered = error.to_string();
        eprintln!("inspect_openclaw_status join failed:\n{}", rendered);
        rendered
    })?
    .map_err(render_error)
}

#[tauri::command]
pub async fn setup_openclaw_provider(
    input: ProviderSetupInput,
) -> Result<ProviderSetupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_provider_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "provider-config",
        );
        let _ = sync_installation_status_by_config_path(&PathBuf::from(&result.config_path));
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
pub async fn setup_openclaw_feishu_channel(
    input: FeishuChannelSetupInput,
) -> Result<FeishuChannelSetupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = apply_feishu_channel_setup(&input)?;
        let _ = mark_runtime_action_required(
            &PathBuf::from(&result.config_path),
            "restart",
            "channels.feishu",
        );
        let _ = sync_installation_status_by_config_path(&PathBuf::from(&result.config_path));
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
pub async fn launch_openclaw_runtime(config_path: String) -> Result<ManagedLaunchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = read_openclaw_status(&PathBuf::from(&config_path))?;
        let launch = launch_managed_openclaw(&status)?;
        let _ = mark_installation_runtime_state(
            &PathBuf::from(&config_path),
            "running",
            Some(launch.pid),
            Some(&launch.log_path),
        );
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
pub async fn stop_openclaw_runtime(config_path: String, pid: u32) -> Result<ManagedStopResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = stop_managed_openclaw(pid)?;
        let _ = mark_installation_runtime_state(&PathBuf::from(&config_path), "stopped", None, None);
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
    config_path: String,
    pid: Option<u32>,
) -> Result<ManagedLaunchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(pid) = pid {
            let _ = stop_managed_openclaw(pid);
        }

        let status = read_openclaw_status(&PathBuf::from(&config_path))?;
        let launch = launch_managed_openclaw(&status)?;
        let _ = mark_installation_runtime_state(
            &PathBuf::from(&config_path),
            "running",
            Some(launch.pid),
            Some(&launch.log_path),
        );
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
