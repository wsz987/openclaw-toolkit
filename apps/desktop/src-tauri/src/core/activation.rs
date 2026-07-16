use std::{error::Error, fmt, path::Path, time::Duration};

use anyhow::{anyhow, Context};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::core::{
    license::{validate_license_payload, verify_offline_license, LicensePayload},
    service_endpoints::{remote_service_base_urls, ACTIVATION_VALIDATE_PATH},
};

const REMOTE_ACTIVATION_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRequest {
    pub activation_code: String,
    pub machine_id: Option<String>,
    pub app_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteActivationLicense {
    pub license_id: String,
    pub company_name: String,
    pub tier: String,
    #[serde(default)]
    pub features: Vec<String>,
    pub expires_at: Option<String>,
    pub status: String,
    pub max_activations: Option<u32>,
    pub activation_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteActivationData {
    pub license: Option<RemoteActivationLicense>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteActivationResponse {
    pub success: bool,
    pub code: String,
    pub message: String,
    pub data: Option<RemoteActivationData>,
}

#[derive(Debug, Clone)]
pub struct RemoteActivationTransportError {
    message: String,
}

impl RemoteActivationTransportError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for RemoteActivationTransportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for RemoteActivationTransportError {}

pub trait RemoteActivationClient {
    fn validate(
        &self,
        base_url: &str,
        request: &ActivationRequest,
    ) -> Result<RemoteActivationResponse, RemoteActivationTransportError>;
}

#[derive(Default)]
pub struct ReqwestRemoteActivationClient {
    client: Client,
}

impl ReqwestRemoteActivationClient {
    pub fn new() -> Self {
        Self {
            client: build_http_client(),
        }
    }
}

impl RemoteActivationClient for ReqwestRemoteActivationClient {
    fn validate(
        &self,
        base_url: &str,
        request: &ActivationRequest,
    ) -> Result<RemoteActivationResponse, RemoteActivationTransportError> {
        let url = format!(
            "{}{}",
            base_url.trim_end_matches('/'),
            ACTIVATION_VALIDATE_PATH
        );
        let response = self
            .client
            .post(url)
            .json(request)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| RemoteActivationTransportError::new(error.to_string()))?;

        response
            .json()
            .map_err(|error| RemoteActivationTransportError::new(error.to_string()))
    }
}

pub fn verify_activation_code(
    activation_code: Option<&str>,
    resource_root: &Path,
) -> anyhow::Result<LicensePayload> {
    let client = ReqwestRemoteActivationClient::new();
    verify_activation_code_with_client(
        activation_code,
        resource_root,
        &client,
        &remote_service_base_urls(),
    )
}

pub fn precheck_activation_code(
    activation_code: Option<&str>,
    resource_root: &Path,
) -> anyhow::Result<LicensePayload> {
    let client = ReqwestRemoteActivationClient::new();
    precheck_activation_code_with_client(
        activation_code,
        resource_root,
        &client,
        &remote_service_base_urls(),
    )
}

pub fn verify_activation_code_with_client(
    activation_code: Option<&str>,
    resource_root: &Path,
    client: &impl RemoteActivationClient,
    remote_base_urls: &[&str],
) -> anyhow::Result<LicensePayload> {
    let activation_code = activation_code
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("请输入激活码"))?;

    let request = ActivationRequest {
        activation_code: activation_code.to_string(),
        machine_id: machine_id(),
        app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
    };

    let mut transport_errors = Vec::new();
    for base_url in remote_base_urls {
        match client.validate(base_url, &request) {
            Ok(response) => return remote_response_to_license(response),
            Err(error) => transport_errors.push(format!("{}: {}", base_url, error)),
        }
    }

    verify_offline_license(Some(activation_code), resource_root).with_context(|| {
        if transport_errors.is_empty() {
            "远程激活服务未配置，离线授权保底校验失败".to_string()
        } else {
            format!(
                "远程激活服务不可用（{}），离线授权保底校验失败",
                transport_errors.join("; ")
            )
        }
    })
}

pub fn precheck_activation_code_with_client(
    activation_code: Option<&str>,
    resource_root: &Path,
    client: &impl RemoteActivationClient,
    remote_base_urls: &[&str],
) -> anyhow::Result<LicensePayload> {
    let activation_code = activation_code
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("请输入激活码"))?;

    if let Ok(license) = verify_offline_license(Some(activation_code), resource_root) {
        return Ok(license);
    }

    verify_activation_code_with_client(
        Some(activation_code),
        resource_root,
        client,
        remote_base_urls,
    )
}

fn remote_response_to_license(
    response: RemoteActivationResponse,
) -> anyhow::Result<LicensePayload> {
    if !response.success {
        anyhow::bail!("{}", response.message);
    }

    let data = response
        .data
        .ok_or_else(|| anyhow!("远程激活响应缺少授权数据"))?;
    let license = data
        .license
        .ok_or_else(|| anyhow!("远程激活响应缺少授权数据"))?;
    if license.status != "active" {
        anyhow::bail!("激活码状态不可用: {}", license.status);
    }

    let license = LicensePayload {
        license_id: license.license_id,
        customer: license.company_name,
        tier: license.tier,
        expires_at: license.expires_at,
        features: license.features,
        activation_hash: None,
        iat: None,
        exp: None,
    };
    validate_license_payload(&license)?;
    Ok(license)
}

fn machine_id() -> Option<String> {
    directories::BaseDirs::new().map(|base_dirs| base_dirs.home_dir().display().to_string())
}

fn build_http_client() -> Client {
    Client::builder()
        .timeout(REMOTE_ACTIVATION_TIMEOUT)
        .build()
        .expect("build remote activation http client")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        precheck_activation_code_with_client, verify_activation_code_with_client,
        ActivationRequest, RemoteActivationClient, RemoteActivationData, RemoteActivationLicense,
        RemoteActivationResponse, RemoteActivationTransportError,
    };

    #[derive(Default)]
    struct FakeRemoteActivationClient {
        responses: Vec<Result<RemoteActivationResponse, RemoteActivationTransportError>>,
        requested_base_urls: std::sync::Mutex<Vec<String>>,
    }

    impl FakeRemoteActivationClient {
        fn new(
            responses: Vec<Result<RemoteActivationResponse, RemoteActivationTransportError>>,
        ) -> Self {
            Self {
                responses,
                requested_base_urls: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn requested_base_urls(&self) -> Vec<String> {
            self.requested_base_urls.lock().unwrap().clone()
        }
    }

    impl RemoteActivationClient for FakeRemoteActivationClient {
        fn validate(
            &self,
            base_url: &str,
            _request: &ActivationRequest,
        ) -> Result<RemoteActivationResponse, RemoteActivationTransportError> {
            let mut requested = self.requested_base_urls.lock().unwrap();
            let index = requested.len();
            requested.push(base_url.to_string());
            self.responses[index].clone()
        }
    }

    #[test]
    fn accepts_remote_activation_without_offline_license_file() {
        let client = FakeRemoteActivationClient::new(vec![Ok(success_response())]);

        let license = verify_activation_code_with_client(
            Some("8F3K-29HD-Q7M2"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example"],
        )
        .unwrap();

        assert_eq!(license.license_id, "lic-remote");
        assert_eq!(license.customer, "Remote Co");
        assert_eq!(
            client.requested_base_urls(),
            vec!["https://primary.example"]
        );
    }

    #[test]
    fn tries_fallback_server_when_primary_is_unavailable() {
        let client = FakeRemoteActivationClient::new(vec![
            Err(RemoteActivationTransportError::new("timeout")),
            Ok(success_response()),
        ]);

        let license = verify_activation_code_with_client(
            Some("8F3K-29HD-Q7M2"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example", "http://fallback.example"],
        )
        .unwrap();

        assert_eq!(license.license_id, "lic-remote");
        assert_eq!(
            client.requested_base_urls(),
            vec!["https://primary.example", "http://fallback.example"]
        );
    }

    #[test]
    fn rejects_remote_business_failure_without_offline_fallback() {
        let client = FakeRemoteActivationClient::new(vec![Ok(RemoteActivationResponse {
            success: false,
            code: "NOT_FOUND".to_string(),
            message: "激活码不存在，请检查后重试".to_string(),
            data: Some(RemoteActivationData { license: None }),
        })]);

        let error = verify_activation_code_with_client(
            Some("8F3K-29HD-Q7M2"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example"],
        )
        .unwrap_err();

        assert!(error.to_string().contains("激活码不存在"));
        assert_eq!(
            client.requested_base_urls(),
            vec!["https://primary.example"]
        );
    }

    #[test]
    fn validates_remote_license_payload_before_accepting_it() {
        let mut response = success_response();
        response
            .data
            .as_mut()
            .unwrap()
            .license
            .as_mut()
            .unwrap()
            .tier = "unknown".to_string();
        let client = FakeRemoteActivationClient::new(vec![Ok(response)]);

        let error = verify_activation_code_with_client(
            Some("8F3K-29HD-Q7M2"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example"],
        )
        .unwrap_err();

        assert!(error.to_string().contains("未知授权等级"));
    }

    #[test]
    fn precheck_accepts_valid_offline_license_without_remote_request() {
        let client = FakeRemoteActivationClient::new(Vec::new());

        let license = precheck_activation_code_with_client(
            Some("stage1-dev"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example"],
        )
        .unwrap();

        assert_eq!(license.license_id, "dev-basic");
        assert!(client.requested_base_urls().is_empty());
    }

    #[test]
    fn precheck_uses_remote_validation_when_offline_license_is_not_available() {
        let client = FakeRemoteActivationClient::new(vec![Ok(success_response())]);

        let license = precheck_activation_code_with_client(
            Some("8F3K-29HD-Q7M2"),
            Path::new("missing-resource-root"),
            &client,
            &["https://primary.example"],
        )
        .unwrap();

        assert_eq!(license.license_id, "lic-remote");
        assert_eq!(
            client.requested_base_urls(),
            vec!["https://primary.example"]
        );
    }

    #[test]
    fn configures_remote_activation_timeout() {
        assert_eq!(
            super::REMOTE_ACTIVATION_TIMEOUT,
            std::time::Duration::from_secs(3)
        );
        let _client = super::build_http_client();
    }

    fn success_response() -> RemoteActivationResponse {
        RemoteActivationResponse {
            success: true,
            code: "OK".to_string(),
            message: "激活成功".to_string(),
            data: Some(RemoteActivationData {
                license: Some(RemoteActivationLicense {
                    license_id: "lic-remote".to_string(),
                    company_name: "Remote Co".to_string(),
                    tier: "basic".to_string(),
                    features: Vec::new(),
                    expires_at: None,
                    status: "active".to_string(),
                    max_activations: None,
                    activation_count: 1,
                }),
            }),
        }
    }
}
