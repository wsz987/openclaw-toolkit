use std::{fs, io::copy, path::Path};

use anyhow::Context;
use reqwest::blocking::Client;

use crate::core::manifest::models::ReleaseManifest;

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim_end_matches('/').to_string()
}

pub fn load_release_manifest_from_remote(base_url: &str) -> anyhow::Result<ReleaseManifest> {
    let url = format!("{}/manifest.json", normalize_base_url(base_url));
    let response = Client::new()
        .get(url)
        .send()
        .context("request remote manifest")?
        .error_for_status()
        .context("fetch remote manifest")?;

    Ok(response.json().context("parse remote manifest")?)
}

pub fn download_remote_file(base_url: &str, relative_path: &str, destination: &Path) -> anyhow::Result<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create download dir {}", parent.display()))?;
    }

    let url = format!("{}/{}", normalize_base_url(base_url), relative_path.trim_start_matches('/'));
    let mut response = Client::new()
        .get(url)
        .send()
        .context("request remote artifact")?
        .error_for_status()
        .context("fetch remote artifact")?;

    let mut file = fs::File::create(destination).with_context(|| format!("create {}", destination.display()))?;
    copy(&mut response, &mut file).context("write remote artifact")?;
    Ok(())
}
