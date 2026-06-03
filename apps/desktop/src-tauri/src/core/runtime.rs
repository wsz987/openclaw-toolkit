use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use anyhow::Context;
use chrono::Utc;

pub fn append_install_log(base_dir: &Path, message: &str) -> anyhow::Result<()> {
    let log_dir = base_dir.join("logs");
    let line = format!("{} {}\n", Utc::now().to_rfc3339(), message);
    let log_path = log_dir.join("stage1-install.log");
    println!("[安装日志] {}", message);

    if let Err(error) = append_install_log_inner(&log_dir, &log_path, &line) {
        eprintln!(
            "append_install_log failed for {}: {}",
            log_path.display(),
            error
        );
    }

    Ok(())
}

fn append_install_log_inner(log_dir: &Path, log_path: &Path, line: &str) -> anyhow::Result<()> {
    fs::create_dir_all(log_dir).with_context(|| format!("create log dir {}", log_dir.display()))?;
    let mut handle = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .with_context(|| format!("open {}", log_path.display()))?;
    handle
        .write_all(line.as_bytes())
        .with_context(|| format!("append {}", log_path.display()))?;
    handle
        .flush()
        .with_context(|| format!("flush {}", log_path.display()))?;
    Ok(())
}

pub fn append_error_chain_log(
    base_dir: &Path,
    title: &str,
    error: &anyhow::Error,
) -> anyhow::Result<()> {
    append_install_log(base_dir, &format!("{}: {}", title, error))?;

    for (index, cause) in error.chain().enumerate().skip(1) {
        append_install_log(base_dir, &format!("  cause[{index}]: {cause}"))?;
    }

    Ok(())
}

pub fn backup_existing_dir(
    source: &Path,
    base_dir: &Path,
    label: &str,
) -> anyhow::Result<Option<std::path::PathBuf>> {
    if !source.exists() {
        return Ok(None);
    }

    let backup_dir =
        base_dir
            .join("backups")
            .join(format!("{}-{}", label, Utc::now().format("%Y%m%d%H%M%S")));

    if let Some(parent) = backup_dir.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }

    match fs::rename(source, &backup_dir) {
        Ok(()) => return Ok(Some(backup_dir)),
        Err(rename_error) => {
            copy_dir(source, &backup_dir)
                .with_context(|| format!("backup {} to {}", source.display(), backup_dir.display()))
                .with_context(|| {
                    format!(
                        "rename {} to {} failed first: {}",
                        source.display(),
                        backup_dir.display(),
                        rename_error
                    )
                })?;
        }
    }

    Ok(Some(backup_dir))
}

fn copy_dir(source: &Path, destination: &Path) -> anyhow::Result<()> {
    if should_skip_backup_path(source) {
        return Ok(());
    }

    fs::create_dir_all(destination).with_context(|| format!("create {}", destination.display()))?;
    for entry in fs::read_dir(source).with_context(|| format!("read dir {}", source.display()))? {
        let entry = entry.with_context(|| format!("iterate dir {}", source.display()))?;
        let source_path = entry.path();
        if should_skip_backup_path(&source_path) {
            continue;
        }
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .with_context(|| format!("read file type {}", source_path.display()))?;

        if file_type.is_symlink() {
            copy_symlink_target(&source_path, &destination_path)?;
        } else if file_type.is_dir() {
            copy_dir(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("create {}", parent.display()))?;
            }
            fs::copy(&source_path, &destination_path).with_context(|| {
                format!(
                    "copy {} to {}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn copy_symlink_target(source_path: &Path, destination_path: &Path) -> anyhow::Result<()> {
    let link_target =
        fs::read_link(source_path).with_context(|| format!("read link {}", source_path.display()))?;
    let resolved_target = resolve_link_target(source_path, &link_target);
    let metadata = fs::metadata(&resolved_target)
        .with_context(|| format!("read link target {}", resolved_target.display()))?;

    if metadata.is_dir() {
        copy_dir(&resolved_target, destination_path).with_context(|| {
            format!(
                "copy linked dir {} -> {}",
                resolved_target.display(),
                destination_path.display()
            )
        })?;
    } else {
        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::copy(&resolved_target, destination_path).with_context(|| {
            format!(
                "copy linked file {} to {}",
                resolved_target.display(),
                destination_path.display()
            )
        })?;
    }

    Ok(())
}

fn resolve_link_target(source_path: &Path, link_target: &Path) -> PathBuf {
    if link_target.is_absolute() {
        return link_target.to_path_buf();
    }

    source_path
        .parent()
        .map(|parent| parent.join(link_target))
        .unwrap_or_else(|| link_target.to_path_buf())
}

fn should_skip_backup_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    normalized.contains("\\package\\node_modules")
}
