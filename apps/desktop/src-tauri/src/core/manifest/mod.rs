use std::{fs, path::{Path, PathBuf}};

use anyhow::Context;

use self::models::{InstalledManifest, ReleaseManifest, ToolkitManifest};
use self::settings::ToolkitSettings;

pub mod models;
pub mod settings;

pub fn load_toolkit_manifest(project_root: &Path) -> anyhow::Result<ToolkitManifest> {
    let path = project_root.join("artifacts").join("toolkit-manifest.json");
    read_json(&path)
}

pub fn load_release_manifest(project_root: &Path) -> anyhow::Result<ReleaseManifest> {
    let path = project_root.join("artifacts").join("manifest.json");
    read_json(&path)
}

pub fn load_toolkit_settings(project_root: &Path) -> anyhow::Result<ToolkitSettings> {
    let path = project_root.join("artifacts").join("toolkit-settings.json");
    if !path.exists() {
        return Ok(ToolkitSettings::default());
    }

    read_json(&path)
}

pub fn write_installed_manifest(path: &Path, manifest: &InstalledManifest) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create manifest dir {}", parent.display()))?;
    }

    let content = serde_json::to_string_pretty(manifest)?;
    fs::write(path, content).with_context(|| format!("write installed manifest {}", path.display()))?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> anyhow::Result<T> {
    let content = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parse {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::models::ToolkitManifest;

    #[test]
    fn parses_toolkit_manifest_with_openclaw_field_names() {
        let payload = r#"{
          "toolkitVersion": "0.1.0",
          "schemaVersion": "2026-05-28",
          "defaultOpenClawVersion": "2026.5.20",
          "supportedOpenClawVersions": ["2026.5.20"],
          "environment": {
            "windows": {
              "minVersion": "10.0.0"
            }
          }
        }"#;

        let manifest: ToolkitManifest = serde_json::from_str(payload).unwrap();
        assert_eq!(manifest.default_openclaw_version, "2026.5.20");
        assert_eq!(manifest.supported_openclaw_versions, vec!["2026.5.20"]);
    }
}
