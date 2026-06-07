use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub license_id: String,
    pub customer: String,
    pub tier: String,
    pub expires_at: String,
    #[serde(default)]
    pub features: Vec<String>,
    pub max_openclaw_version: Option<String>,
}

pub fn verify_offline_license(license_key: Option<&str>) -> anyhow::Result<LicensePayload> {
    if license_key.unwrap_or("stage1-dev") == "stage1-dev" {
        return Ok(LicensePayload {
            license_id: "dev-stage-1".to_string(),
            customer: "local-dev".to_string(),
            tier: "stage-1".to_string(),
            expires_at: "2099-12-31".to_string(),
            features: vec![
                "offline-install".to_string(),
                "remote-artifact-install".to_string(),
                "official-npm-install".to_string(),
                "managed-node-runtime".to_string(),
                "local-skills".to_string(),
                "browser-control".to_string(),
                "feishu-plugin".to_string(),
            ],
            max_openclaw_version: Some("1.x".to_string()),
        });
    }

    anyhow::bail!("正式离线授权验签尚未接入公钥")
}
