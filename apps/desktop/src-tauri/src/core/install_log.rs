use std::{collections::VecDeque, fs, path::Path};

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage1InstallLogTail {
    pub path: String,
    pub lines: Vec<String>,
    pub truncated: bool,
}

pub fn read_stage1_install_log_tail(
    base_dir: &Path,
    max_lines: usize,
) -> anyhow::Result<Stage1InstallLogTail> {
    let log_path = base_dir.join("logs").join("stage1-install.log");
    if !log_path.exists() {
        return Ok(Stage1InstallLogTail {
            path: log_path.to_string_lossy().to_string(),
            lines: Vec::new(),
            truncated: false,
        });
    }

    let content =
        fs::read_to_string(&log_path).with_context(|| format!("read {}", log_path.display()))?;
    let normalized_max_lines = max_lines.max(1);
    let mut queue = VecDeque::with_capacity(normalized_max_lines);
    let mut total_lines = 0_usize;

    for line in content.lines() {
        total_lines += 1;
        if queue.len() == normalized_max_lines {
            queue.pop_front();
        }
        queue.push_back(line.to_string());
    }

    Ok(Stage1InstallLogTail {
        path: log_path.to_string_lossy().to_string(),
        lines: queue.into_iter().collect(),
        truncated: total_lines > normalized_max_lines,
    })
}
