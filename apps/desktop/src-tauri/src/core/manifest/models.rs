use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolkitManifest {
    pub toolkit_version: String,
    pub schema_version: String,
    #[serde(rename = "defaultOpenClawVersion", alias = "defaultOpenclawVersion")]
    pub default_openclaw_version: String,
    #[serde(
        rename = "supportedOpenClawVersions",
        alias = "supportedOpenclawVersions"
    )]
    pub supported_openclaw_versions: Vec<String>,
    pub environment: Option<EnvironmentRequirements>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRequirements {
    pub windows: Option<WindowsRequirements>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsRequirements {
    pub min_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalogEntry {
    pub id: String,
    pub label: String,
    pub api: String,
    pub base_url: String,
    pub default_model: String,
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub models: Vec<ProviderModelCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelCatalogEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub input: Vec<String>,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCatalogManifest {
    #[serde(default)]
    pub providers: Vec<ProviderCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredNodeRuntime {
    pub version: String,
    pub range: String,
    pub artifact: String,
    pub sha256: String,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseSkill {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginArtifact {
    pub id: String,
    pub package: String,
    pub version: String,
    pub artifact: String,
    pub sha256: String,
    pub signature: Option<String>,
    pub plugin_entry_id: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub openclaw_version_range: Option<String>,
    #[serde(default)]
    pub node_version_range: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    #[serde(default)]
    pub plugins: Vec<PluginArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseArtifact {
    pub name: String,
    pub version: String,
    pub platform: String,
    pub artifact: String,
    pub sha256: String,
    pub signature: Option<String>,
    pub required_node: RequiredNodeRuntime,
    #[serde(default)]
    pub skills: Vec<ReleaseSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseManifest {
    pub releases: Vec<ReleaseArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstalledPlugin {
    pub id: String,
    pub version: String,
    #[serde(default)]
    pub package: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledManifest {
    #[serde(default = "default_manifest_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub installation_id: Option<String>,
    pub toolkit_version: String,
    pub openclaw_version: String,
    pub node_version: String,
    pub install_mode: String,
    pub installed_at: String,
    #[serde(default)]
    pub base_dir: Option<String>,
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    #[serde(default)]
    pub skills: Vec<ReleaseSkill>,
    #[serde(default)]
    pub plugins: Vec<InstalledPlugin>,
}

fn default_manifest_schema_version() -> u32 {
    1
}
