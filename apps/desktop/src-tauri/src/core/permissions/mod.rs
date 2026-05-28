use std::{fs, path::Path};

use anyhow::Context;

pub fn configure_permissions(openclaw_dir: &Path, config_path: &Path) -> anyhow::Result<()> {
    let config_dir = openclaw_dir.join("config");
    fs::create_dir_all(&config_dir).with_context(|| format!("create config dir {}", config_dir.display()))?;
    let payload = serde_json::json!({
        "appliedAt": chrono::Utc::now().to_rfc3339(),
        "configPath": config_path.to_string_lossy()
    });
    fs::write(config_dir.join("permissions.applied.json"), serde_json::to_string_pretty(&payload)?)?;
    Ok(())
}
