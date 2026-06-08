use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use tauri::AppHandle;

use crate::core::{
    app_state::{
        bootstrap_app_state, resolve_installation_status_by_config_path,
        sync_installation_status_by_config_path,
    },
    openclaw_config::OpenClawStatusSummary,
    status_events::emit_openclaw_status_changed,
};

const RUNNING_POLL_INTERVAL_MS: u64 = 2500;
const IDLE_POLL_INTERVAL_MS: u64 = 10000;
const ERROR_RETRY_INTERVAL_MS: u64 = 5000;

#[derive(Debug, Default)]
struct StatusWatcherSnapshot {
    config_path: Option<PathBuf>,
    last_status: Option<OpenClawStatusSummary>,
}

#[derive(Clone, Default)]
pub struct OpenClawStatusWatcher {
    state: Arc<Mutex<StatusWatcherSnapshot>>,
}

impl OpenClawStatusWatcher {
    pub fn start(&self, app: AppHandle) {
        let watcher = self.clone();
        thread::spawn(move || {
            watcher.run_loop(app);
        });
    }

    pub fn watch_config_path(&self, config_path: impl AsRef<Path>) {
        let mut state = self.state.lock().expect("status watcher poisoned");
        let next_path = config_path.as_ref().to_path_buf();
        let path_changed = state
            .config_path
            .as_ref()
            .map(|current| current != &next_path)
            .unwrap_or(true);

        state.config_path = Some(next_path);
        if path_changed {
            state.last_status = None;
        }
    }

    pub fn clear_watch_target(&self) {
        let mut state = self.state.lock().expect("status watcher poisoned");
        state.config_path = None;
        state.last_status = None;
    }

    pub fn bootstrap_active_installation(&self) {
        let config_path = bootstrap_app_state().ok().and_then(|state| {
            state
                .active_installation
                .map(|installation| installation.config_path)
        });

        match config_path {
            Some(path) if !path.trim().is_empty() => self.watch_config_path(path),
            _ => self.clear_watch_target(),
        }
    }

    fn run_loop(&self, app: AppHandle) {
        loop {
            let (config_path, previous_status) = {
                let state = self.state.lock().expect("status watcher poisoned");
                (state.config_path.clone(), state.last_status.clone())
            };

            let Some(config_path) = config_path else {
                thread::sleep(Duration::from_millis(IDLE_POLL_INTERVAL_MS));
                continue;
            };

            match resolve_installation_status_by_config_path(&config_path) {
                Ok(status) => {
                    let changed = previous_status
                        .as_ref()
                        .map(|current| !status_semantically_equal(current, &status))
                        .unwrap_or(true);

                    {
                        let mut state = self.state.lock().expect("status watcher poisoned");
                        if state
                            .config_path
                            .as_ref()
                            .map(|current| current == &config_path)
                            .unwrap_or(false)
                        {
                            state.last_status = Some(status.clone());
                        }
                    }

                    if changed {
                        let _ = sync_installation_status_by_config_path(&config_path);
                        let _ = emit_openclaw_status_changed(&app, &status);
                    }

                    let delay = if status.runtime_running {
                        RUNNING_POLL_INTERVAL_MS
                    } else {
                        IDLE_POLL_INTERVAL_MS
                    };
                    thread::sleep(Duration::from_millis(delay));
                }
                Err(error) => {
                    eprintln!(
                        "status watcher failed to read {}: {}",
                        config_path.display(),
                        error
                    );
                    thread::sleep(Duration::from_millis(ERROR_RETRY_INTERVAL_MS));
                }
            }
        }
    }
}

fn status_semantically_equal(left: &OpenClawStatusSummary, right: &OpenClawStatusSummary) -> bool {
    left.openclaw_dir == right.openclaw_dir
        && left.node_dir == right.node_dir
        && left.config_path == right.config_path
        && left.workspace_dir == right.workspace_dir
        && left.gateway_url == right.gateway_url
        && left.control_ui_url == right.control_ui_url
        && left.runtime_log_path == right.runtime_log_path
        && left.runtime_running == right.runtime_running
        && left.panel_reachable == right.panel_reachable
        && left.provider_initialized == right.provider_initialized
        && left.provider_id == right.provider_id
        && left.provider_model == right.provider_model
        && left.provider_api_url == right.provider_api_url
        && left.feishu_plugin_enabled == right.feishu_plugin_enabled
        && left.skills_installed == right.skills_installed
        && left.plugins_enabled == right.plugins_enabled
        && left.available_providers == right.available_providers
}
