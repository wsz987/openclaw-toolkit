pub const PRIMARY_REMOTE_SERVICE_BASE_URL: &str = "https://openclaw.wsz987.xyz";
pub const FALLBACK_REMOTE_SERVICE_BASE_URL: &str = "http://47.80.6.78";
pub const ACTIVATION_VALIDATE_PATH: &str = "/api/v1/licenses/validate";
pub const DESKTOP_UPDATE_PATH_TEMPLATE: &str =
    "/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}";

pub fn remote_service_base_urls() -> Vec<&'static str> {
    vec![
        PRIMARY_REMOTE_SERVICE_BASE_URL,
        FALLBACK_REMOTE_SERVICE_BASE_URL,
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
    use serde::Deserialize;

    use super::{
        desktop_update_endpoint_templates, remote_service_base_urls, ACTIVATION_VALIDATE_PATH,
    };

    #[derive(Deserialize)]
    struct TauriConfig {
        bundle: TauriBundle,
        plugins: TauriPlugins,
    }

    #[derive(Deserialize)]
    struct TauriBundle {
        resources: std::collections::BTreeMap<String, String>,
    }

    #[derive(Deserialize)]
    struct TauriPlugins {
        updater: TauriUpdater,
    }

    #[derive(Deserialize)]
    struct TauriUpdater {
        endpoints: Vec<String>,
    }

    #[test]
    fn update_endpoint_templates_are_derived_from_shared_remote_service_hosts() {
        assert_eq!(
            desktop_update_endpoint_templates(),
            vec![
                "https://openclaw.wsz987.xyz/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}",
                "http://47.80.6.78/api/v1/desktop/updates/{{target}}/{{arch}}/{{current_version}}"
            ]
        );
        assert_eq!(
            remote_service_base_urls(),
            vec!["https://openclaw.wsz987.xyz", "http://47.80.6.78"]
        );
        assert_eq!(ACTIVATION_VALIDATE_PATH, "/api/v1/licenses/validate");
    }

    #[test]
    fn tauri_updater_config_uses_the_shared_remote_service_hosts() {
        let config: TauriConfig =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();

        assert_eq!(
            config.plugins.updater.endpoints,
            desktop_update_endpoint_templates()
        );
    }

    #[test]
    fn tauri_bundle_includes_only_license_dat_not_activation_code() {
        let config: TauriConfig =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();

        assert_eq!(
            config
                .bundle
                .resources
                .get("../../../licenses/license.dat")
                .map(String::as_str),
            Some("licenses/license.dat")
        );
        assert!(!config.bundle.resources.contains_key("../../../licenses"));
        assert!(!config
            .bundle
            .resources
            .keys()
            .any(|path| path.contains("activation-code")));
    }
}
