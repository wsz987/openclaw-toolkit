use std::path::Path;

pub fn verify_openclaw_runtime(config_path: &Path) -> anyhow::Result<()> {
    if !config_path.exists() {
        anyhow::bail!("openclaw config not found: {}", config_path.display());
    }
    Ok(())
}
