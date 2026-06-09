use std::{
    collections::BTreeMap,
    env,
    path::{Path, PathBuf},
};

use semver::Version;
use serde::{Deserialize, Serialize};

use crate::core::{
    manifest::{
        load_release_manifest, load_toolkit_settings,
        models::{ReleaseArtifact, ReleaseManifest, RequiredNodeRuntime},
    },
    node_runtime::{ensure_node_version_matches, parse_node_version},
    remote::load_release_manifest_from_remote,
};

const NPM_PACKAGE_NAME: &str = "openclaw";
const NPM_REGISTRY_URL: &str = "https://registry.npmmirror.com/openclaw";
const NPM_RECENT_VERSION_LIMIT: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalogInput {
    pub project_root: Option<String>,
    pub install_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalogOption {
    pub value: String,
    pub label: String,
    pub detail: String,
    pub selectable: bool,
    pub actual_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalogResult {
    pub install_mode: String,
    pub source_ready: bool,
    pub default_value: String,
    pub latest_version: Option<String>,
    pub options: Vec<VersionCatalogOption>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
struct CatalogEntry {
    value: String,
    detail: String,
    selectable: bool,
    release: Option<ReleaseArtifact>,
}

#[derive(Debug, Clone)]
struct InternalCatalog {
    source_ready: bool,
    latest_version: Option<String>,
    entries: Vec<CatalogEntry>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmRegistryPackage {
    #[serde(rename = "dist-tags")]
    dist_tags: Option<NpmDistTags>,
    versions: Option<BTreeMap<String, NpmRegistryVersion>>,
}

#[derive(Debug, Deserialize)]
struct NpmDistTags {
    latest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmRegistryVersion {
    engines: Option<NpmEngines>,
}

#[derive(Debug, Deserialize)]
struct NpmEngines {
    node: Option<String>,
}

pub fn inspect_version_catalog(input: VersionCatalogInput) -> anyhow::Result<VersionCatalogResult> {
    let project_root = resolve_resource_root(input.project_root.as_deref())?;
    let install_mode = input.install_mode.unwrap_or_else(|| "local".to_string());
    Ok(build_version_catalog(&project_root, &install_mode))
}

pub fn build_version_catalog(project_root: &Path, install_mode: &str) -> VersionCatalogResult {
    let catalog = build_internal_catalog(project_root, install_mode);
    let latest_entry = catalog
        .latest_version
        .as_ref()
        .and_then(|version| catalog.entries.iter().find(|entry| entry.value == *version));

    let mut options = Vec::new();
    if let Some(latest_version) = &catalog.latest_version {
        let latest_detail = latest_entry
            .map(|entry| format!("自动选择最新可用版本 {}。{}", latest_version, entry.detail))
            .unwrap_or_else(|| format!("自动选择最新可用版本 {}", latest_version));
        options.push(VersionCatalogOption {
            value: "latest".to_string(),
            label: format!("latest ({})", latest_version),
            detail: latest_detail,
            selectable: latest_entry.map(|entry| entry.selectable).unwrap_or(false),
            actual_version: Some(latest_version.clone()),
        });
    }

    options.extend(catalog.entries.iter().map(|entry| VersionCatalogOption {
        value: entry.value.clone(),
        label: entry.value.clone(),
        detail: entry.detail.clone(),
        selectable: entry.selectable,
        actual_version: Some(entry.value.clone()),
    }));

    let default_value = if options
        .iter()
        .any(|option| option.value == "latest" && option.selectable)
    {
        "latest".to_string()
    } else {
        options
            .iter()
            .find(|option| option.selectable)
            .map(|option| option.value.clone())
            .unwrap_or_else(|| "latest".to_string())
    };

    VersionCatalogResult {
        install_mode: install_mode.to_string(),
        source_ready: catalog.source_ready,
        default_value,
        latest_version: catalog.latest_version,
        options,
        message: catalog.message,
    }
}

pub fn resolve_release_for_install(
    project_root: &Path,
    install_mode: &str,
    selected_version: &str,
) -> anyhow::Result<ReleaseArtifact> {
    let catalog = build_internal_catalog(project_root, install_mode);
    if !catalog.source_ready {
        anyhow::bail!(
            "{}",
            catalog
                .message
                .unwrap_or_else(|| "当前来源暂不可用，无法解析版本".to_string())
        );
    }

    let entry = if selected_version == "latest" {
        let latest_version = catalog
            .latest_version
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("当前来源没有可用版本"))?;

        catalog
            .entries
            .iter()
            .find(|item| item.value == *latest_version)
    } else {
        catalog
            .entries
            .iter()
            .find(|item| item.value == selected_version)
    }
    .ok_or_else(|| anyhow::anyhow!("未找到版本 {}", selected_version))?;

    if !entry.selectable {
        anyhow::bail!("{}", entry.detail);
    }

    entry
        .release
        .clone()
        .ok_or_else(|| anyhow::anyhow!("版本 {} 尚未准备好安装数据", entry.value))
}

fn build_internal_catalog(project_root: &Path, install_mode: &str) -> InternalCatalog {
    match install_mode {
        "local" => build_local_catalog(project_root),
        "remote" => build_remote_catalog(project_root),
        "npm" => build_npm_catalog(project_root),
        other => InternalCatalog {
            source_ready: false,
            latest_version: None,
            entries: Vec::new(),
            message: Some(format!("不支持的安装模式：{}", other)),
        },
    }
}

fn build_local_catalog(project_root: &Path) -> InternalCatalog {
    let manifest = match load_release_manifest(project_root) {
        Ok(manifest) => manifest,
        Err(error) => {
            return InternalCatalog {
                source_ready: false,
                latest_version: None,
                entries: Vec::new(),
                message: Some(format!("读取内置稳定版清单失败：{}", error)),
            };
        }
    };

    let entries = sort_releases_desc(manifest.releases)
        .into_iter()
        .map(|release| {
            let artifact_path = project_root
                .join("artifacts")
                .join("openclaw")
                .join(&release.artifact);
            let node_path = project_root
                .join("artifacts")
                .join("node")
                .join(&release.required_node.artifact);
            let openclaw_ready = artifact_path.exists();
            let node_ready = node_path.exists();
            let selectable = openclaw_ready && node_ready;

            let detail = if selectable {
                format!(
                    "内置稳定版已就绪，Node {} ({})",
                    release.required_node.version, release.required_node.range
                )
            } else if !openclaw_ready {
                format!("缺少内置 OpenClaw 稳定版安装包：{}", artifact_path.display())
            } else {
                format!("缺少内置受管 Node 运行包：{}", node_path.display())
            };

            CatalogEntry {
                value: release.version.clone(),
                detail,
                selectable,
                release: Some(release),
            }
        })
        .collect::<Vec<_>>();

    let latest_version = entries.first().map(|entry| entry.value.clone());
    let source_ready = !entries.is_empty();
    let message = if source_ready {
        None
    } else {
        Some("内置稳定版清单为空".to_string())
    };

    InternalCatalog {
        source_ready,
        latest_version,
        entries,
        message,
    }
}

fn build_remote_catalog(project_root: &Path) -> InternalCatalog {
    let settings = match load_toolkit_settings(project_root) {
        Ok(settings) => settings,
        Err(error) => {
            return InternalCatalog {
                source_ready: false,
                latest_version: None,
                entries: Vec::new(),
                message: Some(format!("读取远程配置失败：{}", error)),
            };
        }
    };

    let Some(remote_base_url) = settings.remote_base_url else {
        return InternalCatalog {
            source_ready: false,
            latest_version: None,
            entries: Vec::new(),
            message: Some("远程模式未配置 remoteBaseUrl".to_string()),
        };
    };

    let manifest = match load_release_manifest_from_remote(&remote_base_url) {
        Ok(manifest) => manifest,
        Err(error) => {
            return InternalCatalog {
                source_ready: false,
                latest_version: None,
                entries: Vec::new(),
                message: Some(format!("拉取远程版本清单失败：{}", error)),
            };
        }
    };

    let entries = sort_releases_desc(manifest.releases)
        .into_iter()
        .map(|release| CatalogEntry {
            value: release.version.clone(),
            detail: format!(
                "远程源可下载安装，Node {} ({})",
                release.required_node.version, release.required_node.range
            ),
            selectable: true,
            release: Some(release),
        })
        .collect::<Vec<_>>();

    let latest_version = entries.first().map(|entry| entry.value.clone());
    let source_ready = !entries.is_empty();
    let message = if source_ready {
        None
    } else {
        Some("远程版本清单为空".to_string())
    };

    InternalCatalog {
        source_ready,
        latest_version,
        entries,
        message,
    }
}

fn build_npm_catalog(project_root: &Path) -> InternalCatalog {
    let known_node_runtimes = load_release_manifest(project_root)
        .ok()
        .map(collect_known_node_runtimes)
        .unwrap_or_default();

    let metadata = match fetch_npm_registry_package() {
        Ok(metadata) => metadata,
        Err(error) => {
            return InternalCatalog {
                source_ready: false,
                latest_version: None,
                entries: Vec::new(),
                message: Some(format!("读取 npm 官方版本目录失败：{}", error)),
            };
        }
    };

    let versions = metadata.versions.unwrap_or_default();
    let latest_version = metadata
        .dist_tags
        .and_then(|tags| tags.latest)
        .filter(|version| !is_filtered_prerelease(version))
        .or_else(|| {
            versions
                .keys()
                .filter(|version| !is_filtered_prerelease(version))
                .filter_map(|version| {
                    parse_sortable_version(version).map(|parsed| (version.clone(), parsed))
                })
                .max_by(|left, right| left.1.cmp(&right.1))
                .map(|item| item.0)
        });

    let mut stable_versions = versions
        .iter()
        .filter(|(version, _)| !is_filtered_prerelease(version))
        .filter_map(|(version, package)| {
            parse_sortable_version(version).map(|parsed| (version.clone(), parsed, package))
        })
        .collect::<Vec<_>>();
    stable_versions.sort_by(|left, right| right.1.cmp(&left.1));
    stable_versions.truncate(NPM_RECENT_VERSION_LIMIT);

    let entries = stable_versions
        .into_iter()
        .map(|(version, _, package)| {
            let node_range = package
                .engines
                .as_ref()
                .and_then(|engines| engines.node.clone())
                .unwrap_or_else(|| ">=0".to_string());
            let matched_node = resolve_compatible_node_runtime(&known_node_runtimes, &node_range);
            let selectable = matched_node.is_some();
            let detail = if let Some(node) = &matched_node {
                format!(
                    "npm 正式发布包，可用受管 Node {} ({})",
                    node.version, node.range
                )
            } else {
                format!(
                    "npm 正式发布包要求 Node {}，当前内置离线 Node 资源不满足",
                    node_range
                )
            };

            let release = matched_node.map(|node| ReleaseArtifact {
                name: NPM_PACKAGE_NAME.to_string(),
                version: version.clone(),
                platform: "win32-x64".to_string(),
                artifact: format!("npm:{}@{}", NPM_PACKAGE_NAME, version),
                sha256: String::new(),
                signature: None,
                required_node: node,
                skills: Vec::new(),
            });

            CatalogEntry {
                value: version,
                detail,
                selectable,
                release,
            }
        })
        .collect::<Vec<_>>();

    let source_ready = !entries.is_empty();
    let message = if !source_ready {
        Some("npm 官方目录中没有可展示的正式版本".to_string())
    } else if entries.iter().all(|entry| !entry.selectable) {
        Some(
            "已读取 npm 正式版本，但当前项目内置的受管 Node 离线包还不满足这些版本要求".to_string(),
        )
    } else {
        None
    };

    InternalCatalog {
        source_ready,
        latest_version,
        entries,
        message,
    }
}

fn collect_known_node_runtimes(manifest: ReleaseManifest) -> Vec<RequiredNodeRuntime> {
    let mut runtimes = Vec::new();

    for release in manifest.releases {
        let exists = runtimes.iter().any(|runtime: &RequiredNodeRuntime| {
            runtime.version == release.required_node.version
                && runtime.range == release.required_node.range
                && runtime.artifact == release.required_node.artifact
        });

        if !exists {
            runtimes.push(release.required_node);
        }
    }

    runtimes.sort_by(|left, right| {
        let left_version = parse_node_version(&left.version).ok();
        let right_version = parse_node_version(&right.version).ok();
        right_version.cmp(&left_version)
    });

    runtimes
}

fn resolve_compatible_node_runtime(
    runtimes: &[RequiredNodeRuntime],
    node_range: &str,
) -> Option<RequiredNodeRuntime> {
    runtimes.iter().find_map(|runtime| {
        let version = parse_node_version(&runtime.version).ok()?;
        ensure_node_version_matches(&version, node_range).ok()?;
        Some(runtime.clone())
    })
}

fn fetch_npm_registry_package() -> anyhow::Result<NpmRegistryPackage> {
    let response = reqwest::blocking::Client::new()
        .get(NPM_REGISTRY_URL)
        .send()?
        .error_for_status()?;

    Ok(response.json()?)
}

fn sort_releases_desc(mut releases: Vec<ReleaseArtifact>) -> Vec<ReleaseArtifact> {
    releases.sort_by(|left, right| {
        let left_version = parse_sortable_version(&left.version);
        let right_version = parse_sortable_version(&right.version);
        right_version.cmp(&left_version)
    });
    releases
}

fn parse_sortable_version(value: &str) -> Option<Version> {
    Version::parse(value).ok()
}

fn is_filtered_prerelease(version: &str) -> bool {
    let lowered = version.to_ascii_lowercase();
    lowered.contains("alpha")
        || lowered.contains("beta")
        || lowered.contains("rc")
        || lowered.contains("canary")
        || lowered.contains("next")
}

fn resolve_resource_root(project_root: Option<&str>) -> anyhow::Result<PathBuf> {
    if let Some(project_root) = project_root {
        let candidate = PathBuf::from(project_root);
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    if let Ok(explicit_root) = env::var("OPENCLAW_TOOLKIT_ROOT") {
        let candidate = PathBuf::from(explicit_root);
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    for candidate in resource_root_candidates() {
        if has_toolkit_manifest(&candidate) {
            return Ok(candidate);
        }
    }

    anyhow::bail!("未找到安装资源目录：需要存在 artifacts/toolkit-manifest.json")
}

fn resource_root_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        candidates.extend(path_with_ancestors(current_dir, 5));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend(path_with_ancestors(exe_dir.to_path_buf(), 6));
        }
    }

    let mut unique = Vec::new();
    for candidate in candidates {
        if !unique
            .iter()
            .any(|existing: &PathBuf| existing == &candidate)
        {
            unique.push(candidate);
        }
    }

    unique
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

fn has_toolkit_manifest(root: &Path) -> bool {
    root.join("artifacts")
        .join("toolkit-manifest.json")
        .exists()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{build_version_catalog, is_filtered_prerelease};

    #[test]
    fn filters_beta_like_versions() {
        assert!(is_filtered_prerelease("2026.5.28-beta.3"));
        assert!(is_filtered_prerelease("2026.5.19-alpha.1"));
        assert!(!is_filtered_prerelease("2026.5.27"));
        assert!(!is_filtered_prerelease("2026.5.3-1"));
    }

    #[test]
    fn local_catalog_includes_latest_alias() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..");
        let catalog = build_version_catalog(&root, "local");

        assert!(catalog
            .options
            .iter()
            .any(|option| option.value == "latest"));
        assert!(catalog
            .options
            .iter()
            .any(|option| option.value == "2026.5.20"));
    }
}
