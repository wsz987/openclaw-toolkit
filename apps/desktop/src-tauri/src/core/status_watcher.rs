use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use tauri::AppHandle;

use crate::core::{
    app_state::{
        apply_runtime_snapshot, bootstrap_app_state, resolve_installation_status_by_config_path,
    },
    openclaw_config::OpenClawStatusSummary,
    runtime_manager::{RuntimeLifecycleState, RuntimeManager},
    status_events::emit_openclaw_status_changed,
};

const ERROR_RETRY_INTERVAL_MS: u64 = 5000;
const IDLE_POLL_INTERVAL_MS: u64 = 10000;

#[derive(Debug, Default)]
struct StatusWatcherSnapshot {
    config_path: Option<PathBuf>,
    last_status: Option<OpenClawStatusSummary>,
}

#[derive(Clone)]
pub struct OpenClawStatusWatcher {
    state: Arc<Mutex<StatusWatcherSnapshot>>,
    runtime_manager: RuntimeManager,
}

impl Default for OpenClawStatusWatcher {
    fn default() -> Self {
        Self::new(RuntimeManager::default())
    }
}

impl OpenClawStatusWatcher {
    pub fn new(runtime_manager: RuntimeManager) -> Self {
        Self {
            state: Arc::new(Mutex::new(StatusWatcherSnapshot::default())),
            runtime_manager,
        }
    }

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

            match self.runtime_manager.reconcile(&config_path) {
                Ok(runtime_snapshot) => {
                    if let Err(error) = apply_runtime_snapshot(&config_path, &runtime_snapshot) {
                        eprintln!(
                            "status watcher failed to persist runtime snapshot for {}: {}",
                            config_path.display(),
                            error
                        );
                    }

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
                                let _ = emit_openclaw_status_changed(&app, &status);
                            }

                            thread::sleep(runtime_poll_interval(runtime_snapshot.state));
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
                Err(error) => {
                    eprintln!(
                        "status watcher failed to reconcile {}: {}",
                        config_path.display(),
                        error
                    );
                    thread::sleep(Duration::from_millis(ERROR_RETRY_INTERVAL_MS));
                }
            }
        }
    }
}

fn runtime_poll_interval(state: RuntimeLifecycleState) -> Duration {
    match state {
        RuntimeLifecycleState::Starting | RuntimeLifecycleState::Stopping => {
            Duration::from_millis(500)
        }
        RuntimeLifecycleState::Running => Duration::from_millis(2500),
        RuntimeLifecycleState::Stopped | RuntimeLifecycleState::Failed => {
            Duration::from_millis(10000)
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
        && left.runtime_state == right.runtime_state
        && left.runtime_pid == right.runtime_pid
        && left.gateway_ready == right.gateway_ready
        && left.runtime_error == right.runtime_error
        && left.runtime_running == right.runtime_running
        && left.panel_reachable == right.panel_reachable
        && left.runtime_action_required == right.runtime_action_required
        && left.pending_config_changes == right.pending_config_changes
        && left.provider_initialized == right.provider_initialized
        && left.provider_id == right.provider_id
        && left.provider_model == right.provider_model
        && left.provider_api_url == right.provider_api_url
        && left.feishu_plugin_enabled == right.feishu_plugin_enabled
        && left.feishu_channel == right.feishu_channel
        && left.weixin_channel == right.weixin_channel
        && left.dingtalk_channel == right.dingtalk_channel
        && left.skills_installed == right.skills_installed
        && left.plugins_enabled == right.plugins_enabled
        && left.installed_plugins == right.installed_plugins
        && left.available_providers == right.available_providers
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::runtime_poll_interval;
    use crate::core::runtime_manager::RuntimeLifecycleState;

    #[test]
    fn runtime_poll_interval_tracks_lifecycle_state() {
        assert_eq!(
            runtime_poll_interval(RuntimeLifecycleState::Starting),
            Duration::from_millis(500)
        );
        assert_eq!(
            runtime_poll_interval(RuntimeLifecycleState::Running),
            Duration::from_millis(2500)
        );
        assert_eq!(
            runtime_poll_interval(RuntimeLifecycleState::Stopping),
            Duration::from_millis(500)
        );
        assert_eq!(
            runtime_poll_interval(RuntimeLifecycleState::Stopped),
            Duration::from_millis(10000)
        );
        assert_eq!(
            runtime_poll_interval(RuntimeLifecycleState::Failed),
            Duration::from_millis(10000)
        );
    }
}
