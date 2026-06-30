use std::{fs, path::Path};

use anyhow::{anyhow, Context};
use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use chrono::{DateTime, NaiveDate, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const LICENSE_PUBLIC_KEY_DER: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/keys/openclaw-license-public.der"
));
const LICENSE_FILE_DIR: &str = "licenses";
const LICENSE_FILE_NAME: &str = "license.dat";
const LICENSE_FILE_VERSION: u8 = 1;
const ED25519_PUBLIC_KEY_DER_PREFIX: &[u8] = &[
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];
const ED25519_SIGNATURE_LEN: usize = 64;
const CODE_ALPHABET: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub license_id: String,
    pub customer: String,
    pub tier: String,
    pub expires_at: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub activation_hash: Option<String>,
    #[serde(default)]
    pub iat: Option<u64>,
    #[serde(default)]
    pub exp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedLicenseFile {
    version: u8,
    #[serde(default)]
    key_id: Option<u8>,
    alg: String,
    payload: String,
    signature: String,
}

pub fn verify_offline_license(
    activation_code: Option<&str>,
    resource_root: &Path,
) -> anyhow::Result<LicensePayload> {
    let activation_code = activation_code
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("请输入离线激活码"))?;

    if activation_code == "stage1-dev" {
        return verify_dev_license();
    }

    let normalized_code = normalize_activation_code(activation_code)?;
    let license_file_path = resource_root.join(LICENSE_FILE_DIR).join(LICENSE_FILE_NAME);
    let license_file = fs::read_to_string(&license_file_path)
        .with_context(|| format!("读取离线授权文件 {}", license_file_path.display()))?;

    verify_signed_license_file(&license_file, &normalized_code, LICENSE_PUBLIC_KEY_DER)
}

fn verify_signed_license_file(
    license_file: &str,
    normalized_code: &str,
    public_key_der: &[u8],
) -> anyhow::Result<LicensePayload> {
    let signed_file: SignedLicenseFile =
        serde_json::from_str(license_file).context("离线授权文件格式无效")?;
    if signed_file.version != LICENSE_FILE_VERSION {
        anyhow::bail!("不支持的离线授权文件版本");
    }
    if signed_file.alg != "Ed25519" {
        anyhow::bail!("不支持的离线授权签名算法");
    }

    let payload = BASE64_URL_SAFE_NO_PAD
        .decode(signed_file.payload.as_bytes())
        .context("离线授权文件 payload 格式无效")?;
    let signature_bytes = BASE64_URL_SAFE_NO_PAD
        .decode(signed_file.signature.as_bytes())
        .context("离线授权文件签名格式无效")?;
    if signature_bytes.len() != ED25519_SIGNATURE_LEN {
        anyhow::bail!("离线授权文件签名格式无效");
    }

    let verifying_key = load_ed25519_public_key(public_key_der)?;
    let signature = Signature::from_slice(&signature_bytes).context("离线授权文件签名格式无效")?;
    verifying_key
        .verify(&payload, &signature)
        .context("离线授权文件验签失败")?;

    let license: LicensePayload =
        serde_json::from_slice(&payload).context("离线授权 payload 格式无效")?;
    validate_activation_code_binding(&license, normalized_code)?;
    validate_license_payload(&license)?;
    Ok(license)
}

fn normalize_activation_code(value: &str) -> anyhow::Result<String> {
    let mut normalized_code = String::new();
    for char in value.trim().chars() {
        if char == '-' || char.is_whitespace() {
            continue;
        }

        let mut normalized = char.to_ascii_uppercase();
        if normalized == 'I' || normalized == 'L' {
            normalized = '1';
        } else if normalized == 'O' {
            normalized = '0';
        }

        if !CODE_ALPHABET.contains(normalized) {
            anyhow::bail!("离线激活码格式无效");
        }
        normalized_code.push(normalized);
    }

    if normalized_code.is_empty() {
        anyhow::bail!("请输入离线激活码");
    }

    Ok(normalized_code)
}

fn activation_code_hash(normalized_code: &str) -> String {
    let digest = Sha256::digest(normalized_code.as_bytes());
    format!("sha256:{}", hex::encode(digest))
}

fn validate_activation_code_binding(
    license: &LicensePayload,
    normalized_code: &str,
) -> anyhow::Result<()> {
    let expected = license
        .activation_hash
        .as_deref()
        .ok_or_else(|| anyhow!("离线授权文件缺少 activationHash"))?;
    if expected != activation_code_hash(normalized_code) {
        anyhow::bail!("离线激活码与授权文件不匹配");
    }
    Ok(())
}

fn load_ed25519_public_key(public_key_der: &[u8]) -> anyhow::Result<VerifyingKey> {
    let public_key = public_key_der
        .strip_prefix(ED25519_PUBLIC_KEY_DER_PREFIX)
        .ok_or_else(|| anyhow!("离线授权公钥加载失败"))?;
    let public_key: [u8; 32] = public_key
        .try_into()
        .map_err(|_| anyhow!("离线授权公钥加载失败"))?;
    VerifyingKey::from_bytes(&public_key).context("离线授权公钥加载失败")
}

pub fn ensure_license_feature(license: &LicensePayload, feature: &str) -> anyhow::Result<()> {
    if license.features.iter().any(|item| item == feature) {
        return Ok(());
    }

    anyhow::bail!("当前授权不包含 {} 能力", feature)
}

pub fn ensure_install_mode_allowed(
    license: &LicensePayload,
    install_mode: &str,
) -> anyhow::Result<()> {
    let required_feature = match install_mode {
        "local" => "offline-install",
        "remote" => "remote-artifact-install",
        "npm" => "official-npm-install",
        other => anyhow::bail!("未知安装模式: {}", other),
    };

    ensure_license_feature(license, required_feature)
}

fn validate_license_payload(license: &LicensePayload) -> anyhow::Result<()> {
    if license.license_id.trim().is_empty() {
        anyhow::bail!("授权缺少 licenseId");
    }
    if license.customer.trim().is_empty() {
        anyhow::bail!("授权缺少 customer");
    }
    match license.tier.as_str() {
        "stage-1" | "stage-2" => {}
        other => anyhow::bail!("未知授权等级: {}", other),
    }
    if license.features.is_empty() {
        anyhow::bail!("授权未包含任何功能能力");
    }

    ensure_not_expired(license)?;
    Ok(())
}

fn ensure_not_expired(license: &LicensePayload) -> anyhow::Result<()> {
    let now = Utc::now();

    if let Some(exp) = license.exp {
        let expires_at = DateTime::<Utc>::from_timestamp(exp as i64, 0)
            .ok_or_else(|| anyhow!("授权 exp 字段无效"))?;
        if expires_at < now {
            anyhow::bail!("授权已过期: {}", license_expiry_label(license));
        }
        return Ok(());
    }

    let Some(expires_at_value) = license.expires_at.as_deref().filter(|value| !value.trim().is_empty()) else {
        return Ok(());
    };

    let expires_at = parse_expiry_date(expires_at_value)?;
    if expires_at < now {
        anyhow::bail!("授权已过期: {}", license_expiry_label(license));
    }
    Ok(())
}

fn license_expiry_label(license: &LicensePayload) -> &str {
    license.expires_at.as_deref().unwrap_or("长期")
}

fn parse_expiry_date(value: &str) -> anyhow::Result<DateTime<Utc>> {
    if let Ok(date_time) = DateTime::parse_from_rfc3339(value) {
        return Ok(date_time.with_timezone(&Utc));
    }

    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .with_context(|| format!("授权过期时间格式无效: {}", value))?;
    let end_of_day = date
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| anyhow!("授权过期时间格式无效: {}", value))?;
    Ok(DateTime::from_naive_utc_and_offset(end_of_day, Utc))
}

#[cfg(debug_assertions)]
fn verify_dev_license() -> anyhow::Result<LicensePayload> {
    Ok(LicensePayload {
        license_id: "dev-stage-1".to_string(),
        customer: "local-dev".to_string(),
        tier: "stage-1".to_string(),
        expires_at: None,
        features: vec![
            "offline-install".to_string(),
            "remote-artifact-install".to_string(),
            "official-npm-install".to_string(),
            "managed-node-runtime".to_string(),
            "local-skills".to_string(),
            "browser-control".to_string(),
            "feishu-plugin".to_string(),
        ],
        activation_hash: None,
        iat: None,
        exp: None,
    })
}

#[cfg(not(debug_assertions))]
fn verify_dev_license() -> anyhow::Result<LicensePayload> {
    anyhow::bail!("生产构建不接受开发授权码")
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const TEST_CODE: &str = "8F3K-29HD-Q7M2";

    fn base_license() -> LicensePayload {
        LicensePayload {
            license_id: "lic-test".to_string(),
            customer: "Test Co".to_string(),
            tier: "stage-1".to_string(),
            expires_at: None,
            features: vec![
                "offline-install".to_string(),
                "managed-node-runtime".to_string(),
            ],
            activation_hash: Some(activation_code_hash(
                normalize_activation_code(TEST_CODE).unwrap().as_str(),
            )),
            iat: Some(1780000000),
            exp: None,
        }
    }

    fn test_keypair() -> (SigningKey, Vec<u8>) {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let verifying_key = signing_key.verifying_key();
        let mut public_key_der = ED25519_PUBLIC_KEY_DER_PREFIX.to_vec();
        public_key_der.extend_from_slice(verifying_key.as_bytes());
        (signing_key, public_key_der)
    }

    fn sign_test_license(license: &LicensePayload, signing_key: &SigningKey) -> String {
        let payload = serde_json::to_vec(license).unwrap();
        let signature = signing_key.sign(&payload);
        serde_json::to_string(&SignedLicenseFile {
            version: LICENSE_FILE_VERSION,
            key_id: Some(1),
            alg: "Ed25519".to_string(),
            payload: BASE64_URL_SAFE_NO_PAD.encode(payload),
            signature: BASE64_URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        })
        .unwrap()
    }

    #[test]
    fn verifies_short_activation_code_with_signed_file() {
        let (signing_key, public_key_der) = test_keypair();
        let license_file = sign_test_license(&base_license(), &signing_key);
        let normalized_code = normalize_activation_code(TEST_CODE).unwrap();
        let license =
            verify_signed_license_file(&license_file, &normalized_code, &public_key_der).unwrap();

        assert_eq!(license.customer, "Test Co");
        ensure_license_feature(&license, "managed-node-runtime").unwrap();
    }

    #[test]
    fn rejects_mismatched_activation_code() {
        let (signing_key, public_key_der) = test_keypair();
        let license_file = sign_test_license(&base_license(), &signing_key);
        let normalized_code = normalize_activation_code("ABCD-1234-WXYZ").unwrap();

        assert!(
            verify_signed_license_file(&license_file, &normalized_code, &public_key_der).is_err()
        );
    }

    #[test]
    fn normalizes_common_code_confusables() {
        assert_eq!(
            normalize_activation_code("oflk-29hd-q7m2").unwrap(),
            "0F1K29HDQ7M2"
        );
    }

    #[test]
    fn rejects_missing_feature() {
        let license = base_license();

        assert!(ensure_license_feature(&license, "feishu-plugin").is_err());
    }

    #[test]
    fn checks_install_mode_features() {
        let license = base_license();

        ensure_install_mode_allowed(&license, "local").unwrap();
        assert!(ensure_install_mode_allowed(&license, "remote").is_err());
    }
}
