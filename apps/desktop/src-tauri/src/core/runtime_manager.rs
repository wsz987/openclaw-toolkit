use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeLifecycleState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub state: RuntimeLifecycleState,
    pub config_path: Option<PathBuf>,
    pub pid: Option<u32>,
    pub log_path: Option<PathBuf>,
    pub started_at: Option<DateTime<Utc>>,
    pub ready_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub adopted: bool,
    pub gateway_live: bool,
    pub gateway_ready: bool,
}

impl Default for RuntimeSnapshot {
    fn default() -> Self {
        Self {
            state: RuntimeLifecycleState::Stopped,
            config_path: None,
            pid: None,
            log_path: None,
            started_at: None,
            ready_at: None,
            last_error: None,
            adopted: false,
            gateway_live: false,
            gateway_ready: false,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeObservation {
    pub process_alive: bool,
    pub gateway_live: bool,
    pub gateway_ready: bool,
    pub port_owner_matches: bool,
    pub startup_timed_out: bool,
}

pub fn reduce_observation(
    current: RuntimeLifecycleState,
    observation: RuntimeObservation,
) -> RuntimeLifecycleState {
    match current {
        RuntimeLifecycleState::Starting if observation.startup_timed_out => {
            RuntimeLifecycleState::Failed
        }
        RuntimeLifecycleState::Starting
            if observation.process_alive
                && observation.gateway_ready
                && observation.port_owner_matches =>
        {
            RuntimeLifecycleState::Running
        }
        RuntimeLifecycleState::Starting | RuntimeLifecycleState::Running
            if !observation.process_alive =>
        {
            RuntimeLifecycleState::Failed
        }
        RuntimeLifecycleState::Running if !observation.port_owner_matches => {
            RuntimeLifecycleState::Failed
        }
        state => state,
    }
}

#[cfg(test)]
mod tests {
    use super::{reduce_observation, RuntimeLifecycleState, RuntimeObservation};

    #[test]
    fn starting_becomes_running_only_after_gateway_is_ready() {
        let running = reduce_observation(
            RuntimeLifecycleState::Starting,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: true,
                port_owner_matches: true,
                startup_timed_out: false,
            },
        );

        assert_eq!(running, RuntimeLifecycleState::Running);
    }

    #[test]
    fn running_process_exit_becomes_failed_without_restart() {
        let failed = reduce_observation(
            RuntimeLifecycleState::Running,
            RuntimeObservation {
                process_alive: false,
                gateway_live: false,
                gateway_ready: false,
                port_owner_matches: false,
                startup_timed_out: false,
            },
        );

        assert_eq!(failed, RuntimeLifecycleState::Failed);
    }

    #[test]
    fn startup_timeout_becomes_failed() {
        let failed = reduce_observation(
            RuntimeLifecycleState::Starting,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: false,
                port_owner_matches: false,
                startup_timed_out: true,
            },
        );

        assert_eq!(failed, RuntimeLifecycleState::Failed);
    }

    #[test]
    fn running_stays_running_when_readiness_temporarily_drops() {
        let running = reduce_observation(
            RuntimeLifecycleState::Running,
            RuntimeObservation {
                process_alive: true,
                gateway_live: true,
                gateway_ready: false,
                port_owner_matches: true,
                startup_timed_out: false,
            },
        );

        assert_eq!(running, RuntimeLifecycleState::Running);
    }
}
