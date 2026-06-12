use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;

use self::models::{
    InstalledManifest, PluginManifest, ProviderCatalogManifest, ReleaseManifest, SkillManifest,
    ToolkitManifest,
};
use self::settings::ToolkitSettings;

pub mod models;
pub mod settings;

pub fn load_toolkit_manifest(project_root: &Path) -> anyhow::Result<ToolkitManifest> {
    let path = project_root.join("artifacts").join("toolkit-manifest.json");
    read_json(&path)
}

pub fn load_provider_catalog(project_root: &Path) -> anyhow::Result<ProviderCatalogManifest> {
    let path = project_root.join("artifacts").join("providers.json");
    read_json(&path)
}

pub fn load_provider_catalog_from_config_path(
    config_path: &Path,
) -> anyhow::Result<ProviderCatalogManifest> {
    let project_root = resolve_resource_root_from_config_path(config_path)?;
    load_provider_catalog(&project_root)
}

pub fn load_release_manifest(project_root: &Path) -> anyhow::Result<ReleaseManifest> {
    let path = project_root.join("artifacts").join("manifest.json");
    read_json(&path)
}

pub fn load_plugin_manifest(project_root: &Path) -> anyhow::Result<PluginManifest> {
    let path = project_root.join("artifacts").join("plugins.json");
    if !path.exists() {
        return Ok(PluginManifest {
            plugins: Vec::new(),
            channels: Vec::new(),
        });
    }

    read_json(&path)
}

pub fn load_skill_manifest(project_root: &Path) -> anyhow::Result<SkillManifest> {
    let path = project_root.join("artifacts").join("skills.json");
    if !path.exists() {
        return Ok(SkillManifest { skills: Vec::new() });
    }

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
        fs::create_dir_all(parent)
            .with_context(|| format!("create manifest dir {}", parent.display()))?;
    }

    let content = serde_json::to_string_pretty(manifest)?;
    fs::write(path, content)
        .with_context(|| format!("write installed manifest {}", path.display()))?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> anyhow::Result<T> {
    let content = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parse {}", path.display()))
}

pub fn resolve_resource_root_from_config_path(config_path: &Path) -> anyhow::Result<PathBuf> {
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let base_dir = openclaw_dir
        .parent()
        .and_then(Path::parent)
        .with_context(|| format!("resolve base dir from {}", config_path.display()))?;
    resolve_resource_root_from_base_dir(base_dir)
}

fn resolve_resource_root_from_base_dir(base_dir: &Path) -> anyhow::Result<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(explicit_root) = std::env::var("OPENCLAW_TOOLKIT_ROOT") {
        candidates.push(PathBuf::from(explicit_root));
    }

    candidates.extend(path_with_ancestors(base_dir.to_path_buf(), 4));

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.extend(path_with_ancestors(current_dir, 5));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend(path_with_ancestors(exe_dir.to_path_buf(), 6));
        }
    }

    for candidate in candidates {
        if candidate
            .join("artifacts")
            .join("toolkit-manifest.json")
            .exists()
            && candidate.join("artifacts").join("providers.json").exists()
        {
            return Ok(candidate);
        }
    }

    anyhow::bail!(
        "未找到安装资源目录：需要存在 artifacts/toolkit-manifest.json 和 artifacts/providers.json"
    )
}

fn path_with_ancestors(start: PathBuf, levels: usize) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut current = Some(start.as_path());

    for _ in 0..=levels {
        let Some(path) = current else {
            break;
        };
        paths.push(path.to_path_buf());
        current = path.parent();
    }

    paths
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
