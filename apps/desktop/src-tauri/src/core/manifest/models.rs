use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolkitManifest {
    pub toolkit_version: String,
    pub schema_version: String,
    pub default_openclaw_version: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledManifest {
    pub toolkit_version: String,
    pub openclaw_version: String,
    pub node_version: String,
    pub install_mode: String,
    pub installed_at: String,
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    #[serde(default)]
    pub skills: Vec<ReleaseSkill>,
}
