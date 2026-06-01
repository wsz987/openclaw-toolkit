use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use anyhow::Context;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use tar::Archive;
use zip::read::ZipArchive;

pub fn sha256_file(path: &Path) -> anyhow::Result<String> {
    let mut file = fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

pub fn verify_sha256(path: &Path, expected: &str) -> anyhow::Result<()> {
    let actual = sha256_file(path)?;
    if actual != expected {
        anyhow::bail!(
            "sha256 mismatch for {}: expected={}, actual={}",
            path.display(),
            expected,
            actual
        );
    }
    Ok(())
}

pub fn prepare_clean_dir(dir: &Path) -> anyhow::Result<()> {
    if dir.exists() {
        fs::remove_dir_all(dir).with_context(|| format!("remove {}", dir.display()))?;
    }
    fs::create_dir_all(dir).with_context(|| format!("create {}", dir.display()))?;
    Ok(())
}

pub fn copy_tree(source: &Path, destination: &Path) -> anyhow::Result<()> {
    if !source.is_dir() {
        anyhow::bail!("source is not a directory: {}", source.display());
    }

    fs::create_dir_all(destination).with_context(|| format!("create {}", destination.display()))?;

    for entry in fs::read_dir(source).with_context(|| format!("read dir {}", source.display()))? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            copy_tree(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)?;
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

pub fn install_archive(archive_path: &Path, destination: &Path) -> anyhow::Result<()> {
    let name = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase();

    prepare_clean_dir(destination)?;

    if name.ends_with(".zip") {
        let file = fs::File::open(archive_path)
            .with_context(|| format!("open archive {}", archive_path.display()))?;
        let mut archive = ZipArchive::new(file).context("open zip archive")?;

        for index in 0..archive.len() {
            let mut file = archive.by_index(index)?;
            let Some(relative_path) = file.enclosed_name().map(|path| path.to_owned()) else {
                continue;
            };

            let out_path = destination.join(relative_path);
            if file.is_dir() {
                fs::create_dir_all(&out_path)?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let mut out_file = fs::File::create(&out_path)?;
                io::copy(&mut file, &mut out_file)?;
            }
        }

        return Ok(());
    }

    if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        let file = fs::File::open(archive_path)
            .with_context(|| format!("open archive {}", archive_path.display()))?;
        let decoder = GzDecoder::new(file);
        let mut archive = Archive::new(decoder);
        archive
            .unpack(destination)
            .with_context(|| format!("unpack {}", archive_path.display()))?;
        return Ok(());
    }

    if archive_path.is_dir() {
        copy_tree(archive_path, destination)?;
        return Ok(());
    }

    anyhow::bail!("unsupported archive format: {}", archive_path.display());
}

pub fn join_path_segments(base: &Path, segments: &[&str]) -> PathBuf {
    segments
        .iter()
        .fold(base.to_path_buf(), |acc, segment| acc.join(segment))
}
