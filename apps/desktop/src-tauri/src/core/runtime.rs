use std::{fs, path::Path};

use anyhow::Context;
use chrono::Utc;

pub fn append_install_log(base_dir: &Path, message: &str) -> anyhow::Result<()> {
    let log_dir = base_dir.join("logs");
    fs::create_dir_all(&log_dir).with_context(|| format!("create log dir {}", log_dir.display()))?;
    let line = format!("{} {}\n", Utc::now().to_rfc3339(), message);
    let log_path = log_dir.join("stage1-install.log");
    let mut existing = fs::read_to_string(&log_path).unwrap_or_default();
    existing.push_str(&line);
    fs::write(log_path, existing)?;
    Ok(())
}

pub fn backup_existing_dir(source: &Path, base_dir: &Path, label: &str) -> anyhow::Result<Option<std::path::PathBuf>> {
    if !source.exists() {
        return Ok(None);
    }

    let backup_dir = base_dir
        .join("backups")
        .join(format!("{}-{}", label, Utc::now().format("%Y%m%d%H%M%S")));

    copy_dir(source, &backup_dir)?;
    Ok(Some(backup_dir))
}

fn copy_dir(source: &Path, destination: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}
