/// 远程更新/制品服务的基地址环境变量。
///
/// 开源发布默认使用占位地址（`.invalid` 为保留 TLD，永不解析）；
/// 部署者可通过环境变量覆盖为自己的更新服务器。
pub const REMOTE_SERVICE_BASE_URL_ENV: &str = "OPENCLAW_REMOTE_SERVICE_BASE_URL";
pub const REMOTE_SERVICE_FALLBACK_BASE_URL_ENV: &str = "OPENCLAW_REMOTE_SERVICE_FALLBACK_BASE_URL";

pub const DEFAULT_REMOTE_SERVICE_BASE_URL: &str = "https://YOUR-UPDATE-SERVER.invalid";

pub const DESKTOP_UPDATE_PATH_TEMPLATE: &str =
    "/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}";

fn configured_base_url(env_name: &str) -> String {
    std::env::var(env_name).unwrap_or_else(|_| DEFAULT_REMOTE_SERVICE_BASE_URL.to_string())
}

pub fn remote_service_base_urls() -> Vec<String> {
    vec![
        configured_base_url(REMOTE_SERVICE_BASE_URL_ENV),
        configured_base_url(REMOTE_SERVICE_FALLBACK_BASE_URL_ENV),
    ]
}

pub fn desktop_update_endpoint_templates() -> Vec<String> {
    remote_service_base_urls()
        .into_iter()
        .map(|base_url| format!("{}{}", base_url, DESKTOP_UPDATE_PATH_TEMPLATE))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{desktop_update_endpoint_templates, remote_service_base_urls, DESKTOP_UPDATE_PATH_TEMPLATE};

    #[test]
    fn endpoint_templates_are_derived_from_remote_service_hosts() {
        let templates = desktop_update_endpoint_templates();
        let base_urls = remote_service_base_urls();

        assert_eq!(templates.len(), 2);
        assert_eq!(base_urls.len(), 2);
        for (template, base_url) in templates.iter().zip(base_urls.iter()) {
            assert!(template.starts_with(base_url));
            assert!(template.ends_with(DESKTOP_UPDATE_PATH_TEMPLATE));
        }
    }

    #[test]
    fn tauri_updater_config_uses_the_shared_remote_service_hosts() {
        let config: TauriConfig =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();

        assert_eq!(
            config.plugins.updater.endpoints.len(),
            2,
            "updater endpoints should stay in sync with remote_service_base_urls()"
        );
        for endpoint in &config.plugins.updater.endpoints {
            assert!(endpoint.starts_with("https://"), "endpoint should use https: {endpoint}");
            assert!(endpoint.ends_with(DESKTOP_UPDATE_PATH_TEMPLATE), "endpoint should end with path template: {endpoint}");
        }
    }

    #[derive(serde::Deserialize)]
    struct TauriConfig {
        plugins: TauriPlugins,
    }

    #[derive(serde::Deserialize)]
    struct TauriPlugins {
        updater: TauriUpdater,
    }

    #[derive(serde::Deserialize)]
    struct TauriUpdater {
        endpoints: Vec<String>,
    }
}
