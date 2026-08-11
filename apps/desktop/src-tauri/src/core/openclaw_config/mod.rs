use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime},
};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::core::{
    artifact::{install_archive, verify_sha256},
    background_process::{
        background_command, process_friendly_path, process_friendly_path_string,
        render_command_output,
    },
    manifest::{
        load_provider_catalog_from_config_path,
        models::{
            InstalledPlugin, ProviderCatalogEntry, ProviderModelCatalogEntry, ReleaseArtifact,
            ReleaseSkill,
        },
    },
    node_runtime::{node_runtime_executable, node_runtime_npm_command, node_runtime_npmrc_path},
    openclaw_cli::{read_plugin_discovery, OpenClawCliContext, OpenClawPluginDiscovery},
    remote::download_remote_file,
    weixin::WeixinChannelSummary,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawStatusSummary {
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    pub workspace_dir: String,
    pub gateway_url: String,
    pub control_ui_url: String,
    pub runtime_state: String,
    pub runtime_pid: Option<u32>,
    pub runtime_log_path: Option<String>,
    pub gateway_ready: bool,
    pub runtime_error: Option<String>,
    pub runtime_action_required: String,
    pub pending_config_changes: Vec<String>,
    pub runtime_running: bool,
    pub panel_reachable: bool,
    pub provider_initialized: bool,
    pub provider_id: Option<String>,
    pub provider_model: Option<String>,
    pub provider_api_url: Option<String>,
    pub available_providers: Vec<ProviderDescriptor>,
    pub feishu_plugin_enabled: bool,
    pub feishu_channel: FeishuChannelSummary,
    pub weixin_channel: WeixinChannelSummary,
    pub dingtalk_channel: DingtalkChannelSummary,
    pub qqbot_channel: crate::core::qqbot::QqbotChannelSummary,
    pub skills_installed: Vec<String>,
    pub plugins_enabled: Vec<String>,
    pub installed_plugins: Vec<InstalledPlugin>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenClawRuntimeContext {
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    pub gateway_url: String,
    pub runtime_log_path: String,
}

const PLUGIN_DISCOVERY_CACHE_TTL: Duration = Duration::from_secs(60);

static PLUGIN_DISCOVERY_CACHE: OnceLock<Mutex<PluginDiscoveryCache>> = OnceLock::new();

fn normalize_plugin_discovery_cache_key(config_path: &Path) -> PathBuf {
    fs::canonicalize(config_path).unwrap_or_else(|_| config_path.to_path_buf())
}

#[derive(Default)]
struct PluginDiscoveryCache {
    entries: HashMap<PathBuf, CachedPluginDiscovery>,
    in_flight: HashSet<PathBuf>,
}

struct CachedPluginDiscovery {
    config_modified_at: SystemTime,
    manifest_modified_at: SystemTime,
    discovered_at: Instant,
    discovery: OpenClawPluginDiscovery,
}

enum PluginDiscoveryCacheLookup {
    Hit(OpenClawPluginDiscovery),
    Reserved,
    Busy,
}

fn plugin_discovery_busy_error() -> anyhow::Error {
    anyhow::anyhow!("plugin discovery already in progress")
}

impl PluginDiscoveryCache {
    fn lookup_or_reserve(
        &mut self,
        config_key: &Path,
        config_modified_at: SystemTime,
        manifest_modified_at: SystemTime,
        lookup_at: Instant,
    ) -> PluginDiscoveryCacheLookup {
        self.prune_expired_entries(lookup_at);

        if let Some(cached) = self.entries.get(config_key) {
            if cached.config_modified_at == config_modified_at
                && cached.manifest_modified_at == manifest_modified_at
            {
                return PluginDiscoveryCacheLookup::Hit(cached.discovery.clone());
            }
        }
        self.entries.remove(config_key);

        if self.in_flight.insert(config_key.to_path_buf()) {
            PluginDiscoveryCacheLookup::Reserved
        } else {
            PluginDiscoveryCacheLookup::Busy
        }
    }

    fn insert_and_release(
        &mut self,
        config_key: &Path,
        config_modified_at: SystemTime,
        manifest_modified_at: SystemTime,
        discovered_at: Instant,
        discovery: OpenClawPluginDiscovery,
    ) {
        self.prune_expired_entries(discovered_at);

        self.entries.insert(
            config_key.to_path_buf(),
            CachedPluginDiscovery {
                config_modified_at,
                manifest_modified_at,
                discovered_at,
                discovery,
            },
        );
        self.in_flight.remove(config_key);
    }

    fn release(&mut self, config_key: &Path) {
        self.in_flight.remove(config_key);
    }

    fn prune_expired_entries(&mut self, now: Instant) {
        self.entries.retain(|_, cached| {
            now.saturating_duration_since(cached.discovered_at) < PLUGIN_DISCOVERY_CACHE_TTL
        });
    }

    #[cfg(test)]
    fn get(
        &mut self,
        config_key: &Path,
        config_modified_at: SystemTime,
        manifest_modified_at: SystemTime,
        lookup_at: Instant,
    ) -> Option<OpenClawPluginDiscovery> {
        match self.lookup_or_reserve(
            config_key,
            config_modified_at,
            manifest_modified_at,
            lookup_at,
        ) {
            PluginDiscoveryCacheLookup::Hit(discovery) => Some(discovery),
            PluginDiscoveryCacheLookup::Reserved => {
                self.release(config_key);
                None
            }
            PluginDiscoveryCacheLookup::Busy => None,
        }
    }

    #[cfg(test)]
    fn insert(
        &mut self,
        config_key: &Path,
        config_modified_at: SystemTime,
        manifest_modified_at: SystemTime,
        discovered_at: Instant,
        discovery: OpenClawPluginDiscovery,
    ) {
        self.insert_and_release(
            config_key,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            discovery,
        );
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    pub id: String,
    pub label: String,
    pub api: String,
    pub base_url: String,
    pub default_model: String,
    pub api_key_env: Option<String>,
    pub aliases: Vec<String>,
    pub models: Vec<ProviderModelDescriptor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelDescriptor {
    pub id: String,
    pub name: String,
    pub input: Vec<String>,
    pub context_window: Option<u64>,
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSetupInput {
    pub config_path: String,
    pub provider_id: String,
    pub api_key: String,
    pub api_url: Option<String>,
    pub primary_model: Option<String>,
    pub grant_agent_permissions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSetupResult {
    pub config_path: String,
    pub provider_id: String,
    pub primary_model: String,
    pub api_url: String,
    pub agent_permissions_granted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectionTestInput {
    pub config_path: String,
    pub provider_id: String,
    pub api_key: Option<String>,
    pub api_url: Option<String>,
    pub primary_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectionTestResult {
    pub provider_id: String,
    pub api_url: String,
    pub test_url: String,
    pub method: String,
    pub ok: bool,
    pub status: Option<u16>,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuChannelSummary {
    pub enabled: bool,
    pub configured: bool,
    pub domain: String,
    pub connection_mode: String,
    pub account_id: String,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub dm_policy: String,
    pub allow_from: Vec<String>,
    pub group_policy: String,
    pub group_allow_from: Vec<String>,
    pub require_mention: bool,
    pub streaming: bool,
    pub block_streaming: bool,
    pub typing_indicator: bool,
    pub resolve_sender_names: bool,
    pub verification_token_configured: bool,
    pub encrypt_key_configured: bool,
    pub webhook_path: Option<String>,
    pub webhook_host: Option<String>,
    pub webhook_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuChannelSetupInput {
    pub config_path: String,
    pub enabled: bool,
    pub domain: Option<String>,
    pub connection_mode: Option<String>,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub dm_policy: Option<String>,
    pub allow_from: Vec<String>,
    pub group_policy: Option<String>,
    pub group_allow_from: Vec<String>,
    pub require_mention: bool,
    pub streaming: bool,
    pub block_streaming: bool,
    pub typing_indicator: bool,
    pub resolve_sender_names: bool,
    pub verification_token: Option<String>,
    pub encrypt_key: Option<String>,
    pub webhook_path: Option<String>,
    pub webhook_host: Option<String>,
    pub webhook_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeishuChannelSetupResult {
    pub config_path: String,
    pub enabled: bool,
    pub configured: bool,
    pub connection_mode: String,
    pub app_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkChannelSummary {
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
    pub client_id: Option<String>,
    pub client_secret_configured: bool,
    pub dm_policy: String,
    pub allow_from: Vec<String>,
    pub group_policy: String,
    pub group_allow_from: Vec<String>,
    pub require_mention: bool,
    pub streaming: bool,
    pub typing_indicator: bool,
    pub resolve_sender_names: bool,
    pub group_reply_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkChannelSetupInput {
    pub config_path: String,
    pub enabled: bool,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub dm_policy: Option<String>,
    pub allow_from: Vec<String>,
    pub group_policy: Option<String>,
    pub group_allow_from: Vec<String>,
    pub require_mention: bool,
    pub streaming: bool,
    pub typing_indicator: bool,
    pub resolve_sender_names: bool,
    pub group_reply_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DingtalkChannelSetupResult {
    pub config_path: String,
    pub enabled: bool,
    pub configured: bool,
    pub client_id: Option<String>,
}

const DEFAULT_GATEWAY_PORT: u16 = 18789;
const DEFAULT_GATEWAY_BIND: &str = "loopback";
const DEFAULT_GATEWAY_MODE: &str = "local";
const LEGACY_FEISHU_PLUGIN_ID: &str = "feishu";
const DEFAULT_FEISHU_PLUGIN_ENTRY_ID: &str = "openclaw-lark";
const DEFAULT_DINGTALK_PLUGIN_ENTRY_ID: &str = "dingtalk-connector";
const DEFAULT_BROWSER_PLUGIN_ID: &str = "browser";
const DEFAULT_OPENAI_PROVIDER_API: &str = "openai-completions";
const DEFAULT_AGENT_SKILLS: [&str; 2] = ["browser-control", "local-filesystem"];
const LEGACY_DINGTALK_EXTRA_FIELDS: [&str; 2] = ["channelConfigUpdatedAt", "streaming"];

pub fn openclaw_dir(base_dir: &Path, release: &ReleaseArtifact) -> PathBuf {
    base_dir.join("openclaw").join(&release.version)
}

pub fn install_openclaw(
    project_root: &Path,
    base_dir: &Path,
    release: &ReleaseArtifact,
    install_mode: &str,
    node_dir: &Path,
    remote_base_url: Option<&str>,
    progress_callback: Option<&(dyn Fn(&str) + Sync)>,
) -> anyhow::Result<PathBuf> {
    let openclaw_dir = openclaw_dir(base_dir, release);

    if install_mode == "npm" {
        install_openclaw_via_npm(&openclaw_dir, &release.version, node_dir)?;
    } else {
        let artifact_path = if let Some(remote_base_url) = remote_base_url {
            let cache_path = base_dir
                .join("downloads")
                .join("openclaw")
                .join(&release.artifact);
            download_remote_file(
                remote_base_url,
                &format!("artifacts/openclaw/{}", release.artifact),
                &cache_path,
            )?;
            cache_path
        } else {
            project_root
                .join("artifacts")
                .join("openclaw")
                .join(&release.artifact)
        };

        if !artifact_path.exists() {
            anyhow::bail!("openclaw artifact not found: {}", artifact_path.display());
        }

        verify_sha256(&artifact_path, &release.sha256)?;
        progress_callback.map(|callback| callback("正在解压 OpenClaw 主程序包..."));
        install_archive(&artifact_path, &openclaw_dir)?;
        ensure_openclaw_package_dependencies(&openclaw_dir, node_dir, progress_callback)?;
    }

    if !openclaw_dir.exists() {
        anyhow::bail!("openclaw install failed: {}", openclaw_dir.display());
    }

    Ok(openclaw_dir)
}

pub fn write_openclaw_config(
    config_path: &Path,
    _release: &ReleaseArtifact,
    default_skills: &[ReleaseSkill],
    openclaw_dir: &Path,
    _node_dir: &Path,
    provider_catalog: &[ProviderCatalogEntry],
) -> anyhow::Result<()> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create config dir {}", parent.display()))?;
    }

    let workspace_dir = openclaw_dir.join("workspace");
    let provider_catalog = default_provider_catalog(provider_catalog);
    let default_provider = provider_catalog
        .first()
        .cloned()
        .unwrap_or_else(fallback_provider_entry);

    let default_agent_models = default_agent_models_map(std::slice::from_ref(&default_provider));
    let default_skills = default_skill_names(default_skills);

    let config = json!({
        "gateway": {
            "mode": DEFAULT_GATEWAY_MODE,
            "bind": DEFAULT_GATEWAY_BIND,
            "port": DEFAULT_GATEWAY_PORT,
            "auth": {
                "mode": "none"
            },
            "controlUi": {
                "allowedOrigins": [
                    format!("http://127.0.0.1:{DEFAULT_GATEWAY_PORT}"),
                    format!("http://localhost:{DEFAULT_GATEWAY_PORT}")
                ]
            }
        },
        "agents": {
            "defaults": {
                "model": {
                    "primary": default_provider.default_model
                },
                "models": default_agent_models,
                "workspace": workspace_dir.to_string_lossy(),
                "skills": &default_skills,
                "heartbeat": {
                    "every": "0m"
                },
                "sandbox": {
                    "mode": "off"
                }
            }
        },
        "tools": {
            "profile": "coding",
            "deny": ["browser", "canvas"],
            "fs": {
                "workspaceOnly": true
            },
            "exec": {
                "security": "full",
                "ask": "off",
                "applyPatch": {
                    "workspaceOnly": true
                }
            }
        },
        "models": {
            "mode": "merge",
            "providers": {}
        },
        "skills": {
            "entries": default_skill_entries(&default_skills)
        },
        "plugins": {
            "allow": [DEFAULT_BROWSER_PLUGIN_ID],
            "bundledDiscovery": "allowlist",
            "entries": {
                DEFAULT_BROWSER_PLUGIN_ID: {
                    "enabled": true
                }
            }
        }
    });

    fs::write(config_path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

pub fn ensure_plugins_allowlist_entry(config_path: &Path, plugin_id: &str) -> anyhow::Result<bool> {
    let plugin_id = plugin_id.trim();
    if plugin_id.is_empty() {
        return Ok(false);
    }

    let mut config = read_openclaw_config_value(config_path)?;
    let changed = ensure_plugins_allowlist_entry_in_value(&mut config, plugin_id);
    if changed {
        write_config_value(config_path, &config)?;
    }
    Ok(changed)
}

pub fn remove_plugins_allowlist_entry(config_path: &Path, plugin_id: &str) -> anyhow::Result<bool> {
    let plugin_id = plugin_id.trim();
    if plugin_id.is_empty() {
        return Ok(false);
    }

    let mut config = read_openclaw_config_value(config_path)?;
    let changed = remove_plugins_allowlist_entry_in_value(&mut config, plugin_id);
    if changed {
        write_config_value(config_path, &config)?;
    }
    Ok(changed)
}

fn ensure_plugins_allowlist_entry_in_value(config: &mut Value, plugin_id: &str) -> bool {
    let normalized = plugin_id.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }

    if !config.is_object() {
        *config = json!({});
    }
    let root = config.as_object_mut().expect("config forced to object");
    let plugins_value = root
        .entry("plugins".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !plugins_value.is_object() {
        *plugins_value = Value::Object(serde_json::Map::new());
    }
    let plugins = plugins_value
        .as_object_mut()
        .expect("plugins forced to object");
    let allow_value = plugins
        .entry("allow".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !allow_value.is_array() {
        *allow_value = Value::Array(Vec::new());
    }

    let allow_list = allow_value.as_array_mut().expect("allow forced to array");
    let exists = allow_list.iter().any(|entry| {
        entry
            .as_str()
            .map(|value| value.trim().eq_ignore_ascii_case(&normalized))
            .unwrap_or(false)
    });
    let mut changed = false;
    if !exists {
        allow_list.push(Value::String(plugin_id.to_string()));
        changed = true;
    }

    let bundled_discovery = plugins
        .entry("bundledDiscovery".to_string())
        .or_insert_with(|| Value::String("allowlist".to_string()));
    if bundled_discovery.as_str() != Some("allowlist") {
        *bundled_discovery = Value::String("allowlist".to_string());
        changed = true;
    }

    changed
}

fn remove_plugins_allowlist_entry_in_value(config: &mut Value, plugin_id: &str) -> bool {
    let normalized = plugin_id.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }

    let Some(plugins) = config.get_mut("plugins").and_then(Value::as_object_mut) else {
        return false;
    };
    let Some(allow) = plugins.get_mut("allow").and_then(Value::as_array_mut) else {
        return false;
    };

    let original_len = allow.len();
    allow.retain(|entry| {
        !entry
            .as_str()
            .map(|value| value.trim().eq_ignore_ascii_case(&normalized))
            .unwrap_or(false)
    });
    original_len != allow.len()
}

pub fn read_openclaw_status(config_path: &Path) -> anyhow::Result<OpenClawStatusSummary> {
    sanitize_legacy_dingtalk_channel_config(config_path).ok();
    let config = read_openclaw_config_value(config_path)?;
    let manifest_catalog = load_provider_catalog_from_config_path(config_path)
        .map(|manifest| manifest.providers)
        .unwrap_or_default();
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest = read_installed_manifest_from_openclaw_dir(openclaw_dir).ok();
    let workspace_dir = string_at_path(&config, &["agents", "defaults", "workspace"])
        .unwrap_or_else(|| openclaw_dir.join("workspace").to_string_lossy().to_string());
    let node_dir = installed_manifest
        .as_ref()
        .map(|manifest| manifest.node_dir.clone())
        .unwrap_or_default();
    let gateway_port =
        number_at_path(&config, &["gateway", "port"]).unwrap_or(DEFAULT_GATEWAY_PORT as u64);
    let control_ui_url = format!("http://127.0.0.1:{gateway_port}/");
    let gateway_url = format!("http://127.0.0.1:{gateway_port}");
    let runtime_log_path = openclaw_dir
        .join("logs")
        .join("gateway-runtime.log")
        .to_string_lossy()
        .to_string();
    let runtime_running = probe_gateway_runtime(&gateway_url);
    let gateway_ready = probe_gateway_readiness(&gateway_url);
    let runtime_pid = runtime_running
        .then(|| runtime_pid_for_gateway_url(&gateway_url))
        .flatten();
    let panel_reachable = runtime_running && probe_control_panel(&control_ui_url);
    let provider_id = infer_primary_provider_id(&config);
    let provider_api_url = provider_id.as_deref().and_then(|provider| {
        string_at_path(&config, &["models", "providers", provider, "baseUrl"])
    });
    let provider_initialized = provider_id
        .as_deref()
        .and_then(|provider| string_at_path(&config, &["models", "providers", provider, "apiKey"]))
        .map(|value| !value.trim().is_empty() && !value.contains("${"))
        .unwrap_or(false);
    let available_providers = merge_provider_catalog(&manifest_catalog, &config);
    let feishu_channel = read_feishu_channel_summary(&config);
    let plugin_discovery = read_cached_openclaw_discovered_plugins(openclaw_dir, config_path)
        .or_else(|_| {
            Ok::<OpenClawPluginDiscovery, anyhow::Error>(OpenClawPluginDiscovery {
                installed_plugins: installed_manifest
                    .as_ref()
                    .map(|manifest| manifest.plugins.clone())
                    .unwrap_or_default(),
                enabled_plugin_ids: enabled_plugin_ids(&config),
            })
        })?;
    let feishu_plugin_enabled = plugin_discovery.enabled_plugin_ids.iter().any(|plugin_id| {
        plugin_id.eq_ignore_ascii_case(DEFAULT_FEISHU_PLUGIN_ENTRY_ID)
            || plugin_id.eq_ignore_ascii_case(LEGACY_FEISHU_PLUGIN_ID)
    }) || bool_at_path(
        &config,
        &[
            "plugins",
            "entries",
            DEFAULT_FEISHU_PLUGIN_ENTRY_ID,
            "enabled",
        ],
    )
    .unwrap_or(false)
        || bool_at_path(
            &config,
            &["plugins", "entries", LEGACY_FEISHU_PLUGIN_ID, "enabled"],
        )
        .unwrap_or(false);

    let weixin_channel = crate::core::weixin::read_weixin_channel_summary(
        &config,
        Some(&plugin_discovery),
        config_path,
    );
    let dingtalk_channel = read_dingtalk_channel_summary(&config);
    let qqbot_channel = crate::core::qqbot::read_qqbot_channel_summary_from_config(
        &config,
        Some(&plugin_discovery),
    );

    Ok(OpenClawStatusSummary {
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        node_dir,
        config_path: config_path.to_string_lossy().to_string(),
        workspace_dir,
        gateway_url,
        control_ui_url,
        runtime_state: if runtime_running {
            "running".to_string()
        } else {
            "stopped".to_string()
        },
        runtime_pid,
        runtime_log_path: Some(runtime_log_path),
        gateway_ready,
        runtime_error: None,
        runtime_action_required: "none".to_string(),
        pending_config_changes: Vec::new(),
        runtime_running,
        panel_reachable,
        provider_initialized,
        provider_id,
        provider_model: string_at_path(&config, &["agents", "defaults", "model", "primary"]),
        provider_api_url,
        available_providers,
        feishu_plugin_enabled,
        feishu_channel,
        weixin_channel,
        dingtalk_channel,
        qqbot_channel,
        skills_installed: enabled_skill_ids(&config),
        plugins_enabled: plugin_discovery.enabled_plugin_ids,
        installed_plugins: plugin_discovery.installed_plugins,
    })
}

pub fn read_openclaw_runtime_context(config_path: &Path) -> anyhow::Result<OpenClawRuntimeContext> {
    let config = read_openclaw_config_value(config_path)?;
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest = read_installed_manifest_from_openclaw_dir(openclaw_dir)?;
    let gateway_port =
        number_at_path(&config, &["gateway", "port"]).unwrap_or(DEFAULT_GATEWAY_PORT as u64);

    Ok(OpenClawRuntimeContext {
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        node_dir: installed_manifest.node_dir,
        config_path: config_path.to_string_lossy().to_string(),
        gateway_url: format!("http://127.0.0.1:{gateway_port}"),
        runtime_log_path: openclaw_dir
            .join("logs")
            .join("gateway-runtime.log")
            .to_string_lossy()
            .to_string(),
    })
}

pub fn probe_gateway_runtime(gateway_url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(gateway_url) else {
        return false;
    };

    let Some(host) = url.host_str() else {
        return false;
    };

    let Some(port) = url.port_or_known_default() else {
        return false;
    };

    let Ok(addresses) = format!("{host}:{port}").to_socket_addrs() else {
        return false;
    };

    for address in addresses {
        if TcpStream::connect_timeout(&address, Duration::from_millis(350)).is_ok() {
            return true;
        }
    }

    false
}

pub fn probe_gateway_liveness(gateway_url: &str) -> bool {
    probe_gateway_endpoint(gateway_url, "/healthz")
}

pub fn probe_gateway_readiness(gateway_url: &str) -> bool {
    probe_gateway_endpoint(gateway_url, "/readyz")
}

fn probe_gateway_endpoint(gateway_url: &str, endpoint: &str) -> bool {
    let Ok(base_url) = reqwest::Url::parse(gateway_url) else {
        return false;
    };
    let Ok(url) = base_url.join(endpoint) else {
        return false;
    };

    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(750))
        .build()
        .and_then(|client| client.get(url).send())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

pub fn runtime_pid_for_gateway_url(gateway_url: &str) -> Option<u32> {
    gateway_port_from_url(gateway_url).and_then(find_runtime_pid_by_port)
}

fn gateway_port_from_url(gateway_url: &str) -> Option<u16> {
    reqwest::Url::parse(gateway_url)
        .ok()?
        .port_or_known_default()
}

#[cfg(target_os = "windows")]
fn find_runtime_pid_by_port(port: u16) -> Option<u32> {
    let output = background_command("netstat")
        .args(["-ano", "-p", "tcp"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    find_runtime_pid_in_netstat(port, &String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn find_runtime_pid_in_netstat(port: u16, output: &str) -> Option<u32> {
    let target_suffix = format!(":{port}");
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find_map(|line| {
            let columns: Vec<&str> = line.split_whitespace().collect();
            if columns.len() < 5 {
                return None;
            }

            let proto = columns[0];
            let local_address = columns[1];
            let state = columns[3];
            let pid = columns.last().copied()?;
            if !proto.eq_ignore_ascii_case("TCP")
                || !state.eq_ignore_ascii_case("LISTENING")
                || !local_address.ends_with(&target_suffix)
            {
                return None;
            }

            pid.parse::<u32>().ok().filter(|pid| *pid > 0)
        })
}

#[cfg(not(target_os = "windows"))]
fn find_runtime_pid_by_port(_port: u16) -> Option<u32> {
    None
}

fn probe_control_panel(control_ui_url: &str) -> bool {
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
    else {
        return false;
    };

    client.get(control_ui_url).send().is_ok()
}

pub fn apply_provider_setup(input: &ProviderSetupInput) -> anyhow::Result<ProviderSetupResult> {
    let config_path = PathBuf::from(&input.config_path);
    let mut config = read_openclaw_config_value(&config_path)?;
    let manifest_catalog = load_provider_catalog_from_config_path(&config_path)
        .map(|manifest| manifest.providers)
        .unwrap_or_default();
    let provider = normalize_provider_choice(&input.provider_id, &manifest_catalog, &config)?;
    let api_url = resolve_provider_api_url(&provider, input.api_url.as_deref());
    let primary_model = input
        .primary_model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| provider.default_model.clone());
    let api_key = resolve_provider_api_key(&config, &provider.id, Some(input.api_key.as_str()))?;
    let active_provider = provider_catalog_entry_from_choice(&provider);

    set_value_at_path(
        &mut config,
        &["agents", "defaults", "model", "primary"],
        Value::String(primary_model.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers"],
        provider_catalog_json(std::slice::from_ref(&active_provider)),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "baseUrl"],
        Value::String(api_url.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "apiKey"],
        Value::String(api_key),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "api"],
        Value::String(provider.api.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "models"],
        provider_models_value(&provider.models),
    );
    let agent_models = default_agent_models_map(std::slice::from_ref(&active_provider));
    set_value_at_path(&mut config, &["agents", "defaults", "models"], agent_models);

    if input.grant_agent_permissions {
        merge_agent_permissions(&mut config);
    }

    write_config_value(&config_path, &config)?;

    Ok(ProviderSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        provider_id: provider.id,
        primary_model,
        api_url,
        agent_permissions_granted: input.grant_agent_permissions,
    })
}

pub fn test_provider_connection(
    input: &ProviderConnectionTestInput,
) -> anyhow::Result<ProviderConnectionTestResult> {
    let config_path = PathBuf::from(&input.config_path);
    let config = read_openclaw_config_value(&config_path)?;
    let manifest_catalog = load_provider_catalog_from_config_path(&config_path)
        .map(|manifest| manifest.providers)
        .unwrap_or_default();
    let provider = normalize_provider_choice(&input.provider_id, &manifest_catalog, &config)?;
    let api_url = resolve_provider_api_url(&provider, input.api_url.as_deref());
    let primary_model = input
        .primary_model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            string_at_path(&config, &["agents", "defaults", "model", "primary"])
                .unwrap_or_else(|| provider.default_model.clone())
        });
    let api_key = resolve_provider_api_key(&config, &provider.id, input.api_key.as_deref())?;

    let uses_chat_completion_probe = should_use_chat_completion_probe(&provider.id, &api_url);
    let test_url = if uses_chat_completion_probe {
        format!("{}/chat/completions", api_url.trim_end_matches('/'))
    } else {
        format!("{}/models", api_url.trim_end_matches('/'))
    };
    let method = if uses_chat_completion_probe {
        "POST"
    } else {
        "GET"
    }
    .to_string();

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .context("创建 API 测试客户端失败")?;

    let mut request = client
        .request(
            if uses_chat_completion_probe {
                reqwest::Method::POST
            } else {
                reqwest::Method::GET
            },
            &test_url,
        )
        .bearer_auth(api_key);

    if uses_chat_completion_probe {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .json(&json!({
                "model": model_id_for_provider_request(&provider.id, &primary_model),
                "messages": [{ "role": "user", "content": "ping" }],
                "max_tokens": 1
            }));
    }

    let response = request
        .send()
        .with_context(|| format!("请求测试端点失败: {}", test_url))?;
    let status = response.status();
    let status_code = status.as_u16();
    let body_text = response.text().unwrap_or_default();

    if status.is_success() {
        return Ok(ProviderConnectionTestResult {
            provider_id: provider.id,
            api_url,
            test_url,
            method,
            ok: true,
            status: Some(status_code),
            detail: format!("连接成功，HTTP {}", status_code),
        });
    }

    Ok(ProviderConnectionTestResult {
        provider_id: provider.id,
        api_url,
        test_url,
        method,
        ok: false,
        status: Some(status_code),
        detail: extract_provider_test_error_detail(status_code, &body_text),
    })
}

pub fn apply_feishu_channel_setup(
    input: &FeishuChannelSetupInput,
) -> anyhow::Result<FeishuChannelSetupResult> {
    let config_path = PathBuf::from(&input.config_path);
    if input.enabled {
        let _ = ensure_plugins_allowlist_entry(&config_path, DEFAULT_FEISHU_PLUGIN_ENTRY_ID)?;
    }
    let mut config = read_openclaw_config_value(&config_path)?;

    let account_id = "default";
    let domain = normalize_non_empty(input.domain.as_deref(), Some("feishu".to_string()));
    let connection_mode = normalize_non_empty(
        input.connection_mode.as_deref(),
        Some("websocket".to_string()),
    );
    let dm_policy = normalize_non_empty(input.dm_policy.as_deref(), Some("open".to_string()));
    let group_policy = normalize_non_empty(input.group_policy.as_deref(), Some("open".to_string()));
    let allow_from = if dm_policy == "open" && input.allow_from.is_empty() {
        vec!["*".to_string()]
    } else {
        input.allow_from.clone()
    };
    let app_id = normalize_optional_non_empty(
        input.app_id.as_deref(),
        string_at_path(&config, &["channels", "feishu", "appId"]).or_else(|| {
            value_at_path(&config, &["channels", "feishu", "accounts", account_id])
                .and_then(|entry| entry.get("appId"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        }),
    );
    let app_secret = normalize_optional_non_empty(
        input.app_secret.as_deref(),
        string_at_path(&config, &["channels", "feishu", "appSecret"]).or_else(|| {
            value_at_path(&config, &["channels", "feishu", "accounts", account_id])
                .and_then(|entry| entry.get("appSecret"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        }),
    );
    let verification_token = normalize_optional_non_empty(
        input.verification_token.as_deref(),
        string_at_path(&config, &["channels", "feishu", "verificationToken"]),
    );
    let encrypt_key = normalize_optional_non_empty(
        input.encrypt_key.as_deref(),
        string_at_path(&config, &["channels", "feishu", "encryptKey"]),
    );
    let webhook_path = normalize_optional_non_empty(
        input.webhook_path.as_deref(),
        string_at_path(&config, &["channels", "feishu", "webhookPath"]),
    );
    let webhook_host = normalize_optional_non_empty(
        input.webhook_host.as_deref(),
        string_at_path(&config, &["channels", "feishu", "webhookHost"]),
    );
    let webhook_port = input.webhook_port.or_else(|| {
        number_at_path(&config, &["channels", "feishu", "webhookPort"])
            .and_then(|value| u16::try_from(value).ok())
    });
    set_value_at_path(
        &mut config,
        &[
            "plugins",
            "entries",
            DEFAULT_FEISHU_PLUGIN_ENTRY_ID,
            "enabled",
        ],
        Value::Bool(input.enabled),
    );
    remove_value_at_path(
        &mut config,
        &["plugins", "entries", LEGACY_FEISHU_PLUGIN_ID],
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "domain"],
        Value::String(domain.clone()),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "connectionMode"],
        Value::String(connection_mode.clone()),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "dmPolicy"],
        Value::String(dm_policy),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "allowFrom"],
        string_vec_to_value(&allow_from),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "groupPolicy"],
        Value::String(group_policy),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "groupAllowFrom"],
        string_vec_to_value(&input.group_allow_from),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "requireMention"],
        Value::Bool(input.require_mention),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "streaming"],
        Value::Bool(input.streaming),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "blockStreaming"],
        Value::Bool(input.block_streaming),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "typingIndicator"],
        Value::Bool(input.typing_indicator),
    );
    set_value_at_path(
        &mut config,
        &["channels", "feishu", "resolveSenderNames"],
        Value::Bool(input.resolve_sender_names),
    );

    if let Some(app_id) = app_id.clone() {
        set_value_at_path(
            &mut config,
            &["channels", "feishu", "appId"],
            Value::String(app_id),
        );
    } else {
        remove_value_at_path(&mut config, &["channels", "feishu", "appId"]);
    }

    if let Some(app_secret) = app_secret.clone() {
        set_value_at_path(
            &mut config,
            &["channels", "feishu", "appSecret"],
            Value::String(app_secret),
        );
    } else {
        remove_value_at_path(&mut config, &["channels", "feishu", "appSecret"]);
    }

    remove_value_at_path(&mut config, &["channels", "feishu", "accounts"]);

    if connection_mode == "webhook" {
        if let Some(verification_token) = verification_token {
            set_value_at_path(
                &mut config,
                &["channels", "feishu", "verificationToken"],
                Value::String(verification_token),
            );
        }

        if let Some(encrypt_key) = encrypt_key {
            set_value_at_path(
                &mut config,
                &["channels", "feishu", "encryptKey"],
                Value::String(encrypt_key),
            );
        }

        if let Some(webhook_path) = webhook_path {
            set_value_at_path(
                &mut config,
                &["channels", "feishu", "webhookPath"],
                Value::String(webhook_path),
            );
        }

        if let Some(webhook_host) = webhook_host {
            set_value_at_path(
                &mut config,
                &["channels", "feishu", "webhookHost"],
                Value::String(webhook_host),
            );
        }

        if let Some(webhook_port) = webhook_port {
            set_value_at_path(
                &mut config,
                &["channels", "feishu", "webhookPort"],
                json!(webhook_port),
            );
        }
    }

    write_config_value(&config_path, &config)?;
    let summary = read_feishu_channel_summary(&config);

    Ok(FeishuChannelSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        enabled: summary.enabled,
        configured: summary.configured,
        connection_mode: summary.connection_mode,
        app_id: summary.app_id,
    })
}

fn sanitize_legacy_dingtalk_channel_config(config_path: &Path) -> anyhow::Result<bool> {
    let mut config = read_openclaw_config_value(config_path)?;
    let before = serde_json::to_string(&value_at_path(
        &config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID],
    ))
    .unwrap_or_default();
    remove_legacy_dingtalk_extra_fields(&mut config);
    let after = serde_json::to_string(&value_at_path(
        &config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID],
    ))
    .unwrap_or_default();

    if before != after {
        write_config_value(config_path, &config)?;
        return Ok(true);
    }

    Ok(false)
}

pub fn apply_dingtalk_channel_setup(
    input: &DingtalkChannelSetupInput,
) -> anyhow::Result<DingtalkChannelSetupResult> {
    let config_path = PathBuf::from(&input.config_path);
    if input.enabled {
        let _ = ensure_plugins_allowlist_entry(&config_path, DEFAULT_DINGTALK_PLUGIN_ENTRY_ID)?;
    }
    let mut config = read_openclaw_config_value(&config_path)?;

    let account_id = "default";
    let dm_policy = normalize_non_empty(input.dm_policy.as_deref(), Some("open".to_string()));
    let group_policy = normalize_non_empty(input.group_policy.as_deref(), Some("open".to_string()));
    let allow_from = if dm_policy == "open" && input.allow_from.is_empty() {
        vec!["*".to_string()]
    } else {
        input.allow_from.clone()
    };
    let group_reply_mode = normalize_non_empty(
        input.group_reply_mode.as_deref(),
        Some("aicard".to_string()),
    );
    let client_id = normalize_optional_non_empty(
        input.client_id.as_deref(),
        string_at_path(
            &config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientId"],
        ),
    );
    let client_secret = normalize_optional_non_empty(
        input.client_secret.as_deref(),
        string_at_path(
            &config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientSecret"],
        ),
    );
    remove_legacy_dingtalk_extra_fields(&mut config);

    set_value_at_path(
        &mut config,
        &[
            "plugins",
            "entries",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "enabled",
        ],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "defaultAccount",
        ],
        Value::String(account_id.to_string()),
    );
    set_value_at_path(
        &mut config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "dmPolicy"],
        Value::String(dm_policy),
    );
    set_value_at_path(
        &mut config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "allowFrom"],
        string_vec_to_value(&allow_from),
    );
    set_value_at_path(
        &mut config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "groupPolicy"],
        Value::String(group_policy),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "groupAllowFrom",
        ],
        string_vec_to_value(&input.group_allow_from),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "requireMention",
        ],
        Value::Bool(input.require_mention),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "typingIndicator",
        ],
        Value::Bool(input.typing_indicator),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "resolveSenderNames",
        ],
        Value::Bool(input.resolve_sender_names),
    );
    set_value_at_path(
        &mut config,
        &[
            "channels",
            DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
            "groupReplyMode",
        ],
        Value::String(group_reply_mode),
    );

    if let Some(client_id) = client_id.clone() {
        set_value_at_path(
            &mut config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientId"],
            Value::String(client_id),
        );
    } else {
        remove_value_at_path(
            &mut config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientId"],
        );
    }

    if let Some(client_secret) = client_secret.clone() {
        set_value_at_path(
            &mut config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientSecret"],
            Value::String(client_secret),
        );
    } else {
        remove_value_at_path(
            &mut config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientSecret"],
        );
    }

    write_config_value(&config_path, &config)?;
    let summary = read_dingtalk_channel_summary(&config);

    Ok(DingtalkChannelSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        enabled: summary.enabled,
        configured: summary.configured,
        client_id: summary.client_id,
    })
}

fn read_dingtalk_channel_summary(config: &Value) -> DingtalkChannelSummary {
    let client_id = string_at_path(
        config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientId"],
    );
    let client_secret_configured = string_at_path(
        config,
        &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "clientSecret"],
    )
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);

    DingtalkChannelSummary {
        enabled: bool_at_path(
            config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "enabled"],
        )
        .unwrap_or(false),
        configured: client_id
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
            && client_secret_configured,
        account_id: "default".to_string(),
        client_id,
        client_secret_configured,
        dm_policy: string_at_path(
            config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "dmPolicy"],
        )
        .unwrap_or_else(|| "open".to_string()),
        allow_from: {
            let allow_from = string_array_at_path(
                config,
                &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "allowFrom"],
            );
            if allow_from.is_empty() {
                vec!["*".to_string()]
            } else {
                allow_from
            }
        },
        group_policy: string_at_path(
            config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, "groupPolicy"],
        )
        .unwrap_or_else(|| "open".to_string()),
        group_allow_from: string_array_at_path(
            config,
            &[
                "channels",
                DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
                "groupAllowFrom",
            ],
        ),
        require_mention: bool_at_path(
            config,
            &[
                "channels",
                DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
                "requireMention",
            ],
        )
        .unwrap_or(true),
        // The official connector schema does not expose a top-level `streaming` field.
        // Keep the UI toggle optimistic for now and avoid writing invalid config.
        streaming: true,
        typing_indicator: bool_at_path(
            config,
            &[
                "channels",
                DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
                "typingIndicator",
            ],
        )
        .unwrap_or(true),
        resolve_sender_names: bool_at_path(
            config,
            &[
                "channels",
                DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
                "resolveSenderNames",
            ],
        )
        .unwrap_or(true),
        group_reply_mode: string_at_path(
            config,
            &[
                "channels",
                DEFAULT_DINGTALK_PLUGIN_ENTRY_ID,
                "groupReplyMode",
            ],
        )
        .unwrap_or_else(|| "aicard".to_string()),
    }
}

fn remove_legacy_dingtalk_extra_fields(config: &mut Value) {
    for field in LEGACY_DINGTALK_EXTRA_FIELDS {
        remove_value_at_path(
            config,
            &["channels", DEFAULT_DINGTALK_PLUGIN_ENTRY_ID, field],
        );
    }
}

fn read_openclaw_config_value(config_path: &Path) -> anyhow::Result<Value> {
    let raw = fs::read_to_string(config_path)
        .with_context(|| format!("read {}", config_path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", config_path.display()))
}

fn read_installed_manifest_from_openclaw_dir(
    openclaw_dir: &Path,
) -> anyhow::Result<crate::core::manifest::models::InstalledManifest> {
    let manifest_path = openclaw_dir.join("installed-manifest.json");
    let raw = fs::read_to_string(&manifest_path)
        .with_context(|| format!("read {}", manifest_path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", manifest_path.display()))
}

fn write_config_value(config_path: &Path, config: &Value) -> anyhow::Result<()> {
    fs::write(config_path, serde_json::to_string_pretty(config)?)
        .with_context(|| format!("write {}", config_path.display()))?;
    Ok(())
}

fn read_openclaw_discovered_plugins(
    openclaw_dir: &Path,
    config_path: &Path,
) -> anyhow::Result<OpenClawPluginDiscovery> {
    let installed_manifest = read_installed_manifest_from_openclaw_dir(openclaw_dir)?;
    let context = OpenClawCliContext {
        openclaw_dir: openclaw_dir.to_path_buf(),
        config_path: config_path.to_path_buf(),
        node_dir: PathBuf::from(installed_manifest.node_dir),
    };
    read_plugin_discovery(&context)
}

fn read_cached_openclaw_discovered_plugins(
    openclaw_dir: &Path,
    config_path: &Path,
) -> anyhow::Result<OpenClawPluginDiscovery> {
    let config_modified_at = fs::metadata(config_path)
        .with_context(|| format!("read metadata for {}", config_path.display()))?
        .modified()
        .with_context(|| format!("read modification time for {}", config_path.display()))?;
    let manifest_path = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?
        .join("installed-manifest.json");
    let manifest_modified_at = fs::metadata(&manifest_path)
        .with_context(|| format!("read metadata for {}", manifest_path.display()))?
        .modified()
        .with_context(|| format!("read modification time for {}", manifest_path.display()))?;
    let config_key = normalize_plugin_discovery_cache_key(config_path);
    let lookup_at = Instant::now();
    let lookup = {
        let mut cache = PLUGIN_DISCOVERY_CACHE
            .get_or_init(|| Mutex::new(PluginDiscoveryCache::default()))
            .lock()
            .map_err(|_| anyhow::anyhow!("plugin discovery cache lock poisoned"))?;

        cache.lookup_or_reserve(
            &config_key,
            config_modified_at,
            manifest_modified_at,
            lookup_at,
        )
    };
    match lookup {
        PluginDiscoveryCacheLookup::Hit(discovery) => return Ok(discovery),
        PluginDiscoveryCacheLookup::Busy => return Err(plugin_discovery_busy_error()),
        PluginDiscoveryCacheLookup::Reserved => {}
    }

    let discovery = read_openclaw_discovered_plugins(openclaw_dir, config_path);
    let discovered_at = Instant::now();
    let mut cache = PLUGIN_DISCOVERY_CACHE
        .get_or_init(|| Mutex::new(PluginDiscoveryCache::default()))
        .lock()
        .map_err(|_| anyhow::anyhow!("plugin discovery cache lock poisoned"))?;

    match discovery {
        Ok(discovery) => {
            cache.insert_and_release(
                &config_key,
                config_modified_at,
                manifest_modified_at,
                discovered_at,
                discovery.clone(),
            );
            Ok(discovery)
        }
        Err(error) => {
            cache.release(&config_key);
            Err(error)
        }
    }
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn bool_at_path(value: &Value, path: &[&str]) -> Option<bool> {
    value_at_path(value, path).and_then(Value::as_bool)
}

fn number_at_path(value: &Value, path: &[&str]) -> Option<u64> {
    value_at_path(value, path).and_then(Value::as_u64)
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn remove_value_at_path(value: &mut Value, path: &[&str]) {
    if path.is_empty() {
        return;
    }

    let mut current = value;
    for segment in &path[..path.len().saturating_sub(1)] {
        let Some(next) = current.get_mut(*segment) else {
            return;
        };
        current = next;
    }

    if let Some(object) = current.as_object_mut() {
        object.remove(path[path.len() - 1]);
    }
}

fn string_array_at_path(value: &Value, path: &[&str]) -> Vec<String> {
    let Some(items) = value_at_path(value, path).and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            item.as_str().map(ToString::to_string).or_else(|| {
                item.get("name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
        })
        .collect()
}

fn string_vec_to_value(values: &[String]) -> Value {
    Value::Array(
        values
            .iter()
            .map(|value| Value::String(value.trim().to_string()))
            .filter(|value| value.as_str().is_some_and(|entry| !entry.is_empty()))
            .collect(),
    )
}

fn enabled_plugin_ids(value: &Value) -> Vec<String> {
    let Some(entries) = value_at_path(value, &["plugins", "entries"]).and_then(Value::as_object)
    else {
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(|(id, entry)| {
            entry
                .get("enabled")
                .and_then(Value::as_bool)
                .filter(|enabled| *enabled)
                .map(|_| id.to_string())
        })
        .collect()
}

fn enabled_skill_ids(value: &Value) -> Vec<String> {
    let mut skills = string_array_at_path(value, &["agents", "defaults", "skills"]);
    let Some(entries) = value_at_path(value, &["skills", "entries"]).and_then(Value::as_object)
    else {
        return skills;
    };

    skills.retain(|skill| {
        entries
            .get(skill)
            .and_then(|entry| entry.get("enabled"))
            .and_then(Value::as_bool)
            .unwrap_or(true)
    });

    skills
}

fn infer_primary_provider_id(config: &Value) -> Option<String> {
    let primary_model = string_at_path(config, &["agents", "defaults", "model", "primary"])?;
    let provider = primary_model.split('/').next()?.trim();
    (!provider.is_empty()).then(|| provider.to_string())
}

fn set_value_at_path(root: &mut Value, path: &[&str], value: Value) {
    if path.is_empty() {
        *root = value;
        return;
    }

    let mut current = root;
    for segment in &path[..path.len() - 1] {
        if !current.is_object() {
            *current = json!({});
        }

        let object = current.as_object_mut().expect("object ensured");
        current = object
            .entry((*segment).to_string())
            .or_insert_with(|| json!({}));
    }

    if !current.is_object() {
        *current = json!({});
    }

    let object = current.as_object_mut().expect("object ensured");
    object.insert(path[path.len() - 1].to_string(), value);
}

fn merge_agent_permissions(config: &mut Value) {
    set_value_at_path(
        config,
        &["tools", "profile"],
        Value::String("coding".to_string()),
    );
    set_value_at_path(config, &["tools", "deny"], json!(["browser", "canvas"]));
    set_value_at_path(config, &["tools", "fs", "workspaceOnly"], Value::Bool(true));
    set_value_at_path(
        config,
        &["tools", "exec", "security"],
        Value::String("full".to_string()),
    );
    set_value_at_path(
        config,
        &["tools", "exec", "ask"],
        Value::String("off".to_string()),
    );
    set_value_at_path(
        config,
        &["tools", "exec", "applyPatch", "workspaceOnly"],
        Value::Bool(true),
    );
    set_value_at_path(
        config,
        &["agents", "defaults", "sandbox", "mode"],
        Value::String("off".to_string()),
    );
}

fn default_skill_names(skills: &[ReleaseSkill]) -> Vec<String> {
    let names: Vec<String> = skills
        .iter()
        .map(|skill| skill.name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();

    let fallback: Vec<String> = DEFAULT_AGENT_SKILLS
        .iter()
        .map(|skill| skill.to_string())
        .collect();

    if names.is_empty() {
        fallback
    } else {
        names
    }
}

fn default_skill_entries(skills: &[String]) -> Value {
    let entries: serde_json::Map<String, Value> = skills
        .iter()
        .map(|skill| (skill.clone(), json!({ "enabled": true })))
        .collect();
    Value::Object(entries)
}

#[derive(Debug, Clone)]
struct ProviderChoice {
    id: String,
    api: String,
    base_url: String,
    default_model: String,
    models: Vec<ProviderModelDescriptor>,
}

fn normalize_provider_choice(
    provider_id: &str,
    manifest_catalog: &[ProviderCatalogEntry],
    config: &Value,
) -> anyhow::Result<ProviderChoice> {
    let provider_id = provider_id.trim();
    let provider_catalog = merge_provider_catalog(manifest_catalog, config);

    if let Some(provider) = provider_catalog.iter().find(|entry| {
        entry.id == provider_id || entry.aliases.iter().any(|alias| alias == provider_id)
    }) {
        return Ok(ProviderChoice {
            id: provider.id.clone(),
            api: provider.api.clone(),
            base_url: provider.base_url.clone(),
            default_model: provider.default_model.clone(),
            models: provider.models.clone(),
        });
    }

    anyhow::bail!("unsupported provider: {provider_id}")
}

fn resolve_provider_api_url(provider: &ProviderChoice, explicit: Option<&str>) -> String {
    if let Some(explicit) = explicit.map(str::trim).filter(|value| !value.is_empty()) {
        return explicit.to_string();
    }

    provider.base_url.clone()
}

fn provider_catalog_json(provider_catalog: &[ProviderCatalogEntry]) -> Value {
    let mut providers = serde_json::Map::new();

    for provider in provider_catalog {
        let api_key_env = provider
            .api_key_env
            .clone()
            .unwrap_or_else(|| inferred_api_key_env(&provider.id));
        providers.insert(
            provider.id.clone(),
            json!({
                "api": if provider.api.trim().is_empty() { DEFAULT_OPENAI_PROVIDER_API } else { &provider.api },
                "baseUrl": provider.base_url,
                "apiKey": format!("${{{api_key_env}}}"),
                "models": provider.models.iter().map(|model| {
                    json!({
                        "id": model.id,
                        "name": model.name,
                        "input": model.input,
                        "contextWindow": model.context_window,
                        "maxTokens": model.max_tokens,
                    })
                }).collect::<Vec<_>>()
            }),
        );
    }

    Value::Object(providers)
}

fn default_provider_catalog(
    provider_catalog: &[ProviderCatalogEntry],
) -> Vec<ProviderCatalogEntry> {
    if provider_catalog.is_empty() {
        return vec![fallback_provider_entry()];
    }

    provider_catalog.to_vec()
}

fn normalize_non_empty(value: Option<&str>, fallback: Option<String>) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or(fallback)
        .unwrap_or_default()
}

fn normalize_optional_non_empty(value: Option<&str>, fallback: Option<String>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or(fallback)
}

fn read_feishu_channel_summary(config: &Value) -> FeishuChannelSummary {
    let account_id = "default".to_string();
    let account = value_at_path(
        config,
        &["channels", "feishu", "accounts", account_id.as_str()],
    );
    let app_id = string_at_path(config, &["channels", "feishu", "appId"]).or_else(|| {
        account
            .and_then(|entry| entry.get("appId"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
    });
    let app_secret = string_at_path(config, &["channels", "feishu", "appSecret"]).or_else(|| {
        account
            .and_then(|entry| entry.get("appSecret"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
    });

    FeishuChannelSummary {
        enabled: bool_at_path(config, &["channels", "feishu", "enabled"]).unwrap_or(false),
        configured: app_id
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
            && app_secret
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false),
        domain: string_at_path(config, &["channels", "feishu", "domain"])
            .unwrap_or_else(|| "feishu".to_string()),
        connection_mode: string_at_path(config, &["channels", "feishu", "connectionMode"])
            .unwrap_or_else(|| "websocket".to_string()),
        account_id,
        app_id,
        app_secret,
        dm_policy: string_at_path(config, &["channels", "feishu", "dmPolicy"])
            .unwrap_or_else(|| "open".to_string()),
        allow_from: {
            let allow_from = string_array_at_path(config, &["channels", "feishu", "allowFrom"]);
            if allow_from.is_empty() {
                vec!["*".to_string()]
            } else {
                allow_from
            }
        },
        group_policy: string_at_path(config, &["channels", "feishu", "groupPolicy"])
            .unwrap_or_else(|| "open".to_string()),
        group_allow_from: string_array_at_path(config, &["channels", "feishu", "groupAllowFrom"]),
        require_mention: bool_at_path(config, &["channels", "feishu", "requireMention"])
            .unwrap_or(true),
        streaming: bool_at_path(config, &["channels", "feishu", "streaming"]).unwrap_or(true),
        block_streaming: bool_at_path(config, &["channels", "feishu", "blockStreaming"])
            .unwrap_or(false),
        typing_indicator: bool_at_path(config, &["channels", "feishu", "typingIndicator"])
            .unwrap_or(true),
        resolve_sender_names: bool_at_path(config, &["channels", "feishu", "resolveSenderNames"])
            .unwrap_or(true),
        verification_token_configured: string_at_path(
            config,
            &["channels", "feishu", "verificationToken"],
        )
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false),
        encrypt_key_configured: string_at_path(config, &["channels", "feishu", "encryptKey"])
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
        webhook_path: string_at_path(config, &["channels", "feishu", "webhookPath"]),
        webhook_host: string_at_path(config, &["channels", "feishu", "webhookHost"]),
        webhook_port: number_at_path(config, &["channels", "feishu", "webhookPort"])
            .and_then(|value| u16::try_from(value).ok()),
    }
}

fn provider_catalog_entry_from_choice(choice: &ProviderChoice) -> ProviderCatalogEntry {
    ProviderCatalogEntry {
        id: choice.id.clone(),
        label: choice.id.clone(),
        api: choice.api.clone(),
        base_url: choice.base_url.clone(),
        default_model: choice.default_model.clone(),
        api_key_env: Some(inferred_api_key_env(&choice.id)),
        aliases: Vec::new(),
        models: choice
            .models
            .iter()
            .map(|model| ProviderModelCatalogEntry {
                id: model.id.clone(),
                name: model.name.clone(),
                input: model.input.clone(),
                context_window: model.context_window,
                max_tokens: model.max_tokens,
            })
            .collect(),
    }
}

fn fallback_provider_entry() -> ProviderCatalogEntry {
    ProviderCatalogEntry {
        id: "volcengine-agent-plan".to_string(),
        label: "火山引擎 Ark Agent Plan".to_string(),
        api: DEFAULT_OPENAI_PROVIDER_API.to_string(),
        base_url: "https://ark.cn-beijing.volces.com/api/plan/v3".to_string(),
        default_model: "volcengine-agent-plan/ark-code-latest".to_string(),
        api_key_env: Some("VOLCANO_ENGINE_API_KEY".to_string()),
        aliases: vec!["ark-plan".to_string(), "volcengine-plan".to_string()],
        models: vec![ProviderModelCatalogEntry {
            id: "ark-code-latest".to_string(),
            name: "Ark Code Latest".to_string(),
            input: vec!["text".to_string(), "image".to_string()],
            context_window: Some(256000),
            max_tokens: Some(32000),
        }],
    }
}

fn merge_provider_catalog(
    manifest_catalog: &[ProviderCatalogEntry],
    config: &Value,
) -> Vec<ProviderDescriptor> {
    let mut merged: Vec<ProviderDescriptor> = manifest_catalog
        .iter()
        .map(provider_descriptor_from_catalog)
        .collect();

    let Some(config_providers) =
        value_at_path(config, &["models", "providers"]).and_then(Value::as_object)
    else {
        return if merged.is_empty() {
            vec![provider_descriptor_from_catalog(&fallback_provider_entry())]
        } else {
            merged
        };
    };

    for (provider_id, provider_value) in config_providers {
        let Some(provider_object) = provider_value.as_object() else {
            continue;
        };

        let config_descriptor = ProviderDescriptor {
            id: provider_id.clone(),
            label: merged
                .iter()
                .find(|provider| provider.id == *provider_id)
                .map(|provider| provider.label.clone())
                .unwrap_or_else(|| provider_id.clone()),
            api: provider_object
                .get("api")
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_OPENAI_PROVIDER_API)
                .to_string(),
            base_url: provider_object
                .get("baseUrl")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            default_model: merged
                .iter()
                .find(|provider| provider.id == *provider_id)
                .map(|provider| provider.default_model.clone())
                .unwrap_or_else(|| format!("{provider_id}/{}", first_model_id(provider_object))),
            api_key_env: merged
                .iter()
                .find(|provider| provider.id == *provider_id)
                .and_then(|provider| provider.api_key_env.clone()),
            aliases: merged
                .iter()
                .find(|provider| provider.id == *provider_id)
                .map(|provider| provider.aliases.clone())
                .unwrap_or_default(),
            models: provider_models_from_value(provider_object.get("models")),
        };

        if let Some(existing) = merged
            .iter_mut()
            .find(|provider| provider.id == *provider_id)
        {
            if !config_descriptor.base_url.trim().is_empty() {
                existing.base_url = config_descriptor.base_url;
            }
            if !config_descriptor.models.is_empty() {
                existing.models = config_descriptor.models;
            }
            if existing.default_model.trim().is_empty() {
                existing.default_model = config_descriptor.default_model;
            }
            if existing.label.trim().is_empty() {
                existing.label = config_descriptor.label;
            }
        } else {
            merged.push(config_descriptor);
        }
    }

    if merged.is_empty() {
        merged.push(provider_descriptor_from_catalog(&fallback_provider_entry()));
    }

    merged
}

fn provider_descriptor_from_catalog(provider: &ProviderCatalogEntry) -> ProviderDescriptor {
    ProviderDescriptor {
        id: provider.id.clone(),
        label: provider.label.clone(),
        api: provider.api.clone(),
        base_url: provider.base_url.clone(),
        default_model: provider.default_model.clone(),
        api_key_env: provider.api_key_env.clone(),
        aliases: provider.aliases.clone(),
        models: provider
            .models
            .iter()
            .map(|model| ProviderModelDescriptor {
                id: model.id.clone(),
                name: model.name.clone(),
                input: model.input.clone(),
                context_window: model.context_window,
                max_tokens: model.max_tokens,
            })
            .collect(),
    }
}

fn provider_models_from_value(models_value: Option<&Value>) -> Vec<ProviderModelDescriptor> {
    let Some(items) = models_value.and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(Value::as_str)?.to_string();
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id.as_str())
                .to_string();
            let input = item
                .get("input")
                .and_then(Value::as_array)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect()
                })
                .unwrap_or_default();
            let context_window = item.get("contextWindow").and_then(Value::as_u64);
            let max_tokens = item.get("maxTokens").and_then(Value::as_u64);

            Some(ProviderModelDescriptor {
                id,
                name,
                input,
                context_window,
                max_tokens,
            })
        })
        .collect()
}

fn provider_models_value(models: &[ProviderModelDescriptor]) -> Value {
    Value::Array(
        models
            .iter()
            .map(|model| {
                json!({
                    "id": model.id,
                    "name": model.name,
                    "input": model.input,
                    "contextWindow": model.context_window,
                    "maxTokens": model.max_tokens,
                })
            })
            .collect(),
    )
}

fn default_agent_models_map(provider_catalog: &[ProviderCatalogEntry]) -> Value {
    let provider_descriptors: Vec<ProviderDescriptor> = provider_catalog
        .iter()
        .map(provider_descriptor_from_catalog)
        .collect();
    default_agent_models_map_from_descriptors(&provider_descriptors)
}

fn default_agent_models_map_from_descriptors(provider_catalog: &[ProviderDescriptor]) -> Value {
    let mut models = serde_json::Map::new();

    for provider in provider_catalog {
        for model in &provider.models {
            models.insert(format!("{}/{}", provider.id, model.id), json!({}));
        }
    }

    Value::Object(models)
}

fn inferred_api_key_env(provider_id: &str) -> String {
    match provider_id {
        "volcengine" | "volcengine-plan" | "volcengine-agent-plan" => {
            "VOLCANO_ENGINE_API_KEY".to_string()
        }
        "qwen" => "DASHSCOPE_API_KEY".to_string(),
        "deepseek" => "DEEPSEEK_API_KEY".to_string(),
        "moonshot" => "MOONSHOT_API_KEY".to_string(),
        "zhipu" => "ZHIPU_API_KEY".to_string(),
        "openai" => "OPENAI_API_KEY".to_string(),
        "xiaomi" | "mimo" | "xiaomi-mimo" => "MIMO_API_KEY".to_string(),
        "minimax" | "minimaxi" => "MINIMAX_API_KEY".to_string(),
        other => format!("{}_API_KEY", other.to_ascii_uppercase().replace('-', "_")),
    }
}

fn resolve_provider_api_key(
    config: &Value,
    provider_id: &str,
    requested_api_key: Option<&str>,
) -> anyhow::Result<String> {
    if let Some(api_key) = requested_api_key
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(api_key.to_string());
    }

    if let Some(existing_api_key) =
        string_at_path(config, &["models", "providers", provider_id, "apiKey"])
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    {
        return Ok(existing_api_key);
    }

    anyhow::bail!("缺少 API Key。首次配置时请先输入有效密钥。");
}

fn should_use_chat_completion_probe(provider_id: &str, api_url: &str) -> bool {
    provider_id.contains("volcengine")
        || provider_id.contains("xiaomi")
        || api_url.contains("volces.com")
        || api_url.contains("xiaomimimo.com")
}

fn model_id_for_provider_request(provider_id: &str, primary_model: &str) -> String {
    let prefix = format!("{provider_id}/");
    primary_model
        .strip_prefix(&prefix)
        .unwrap_or(primary_model)
        .to_string()
}

fn extract_provider_test_error_detail(status_code: u16, body_text: &str) -> String {
    if let Ok(json_body) = serde_json::from_str::<Value>(body_text) {
        if let Some(message) = json_body
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            return message.to_string();
        }

        if let Some(message) = json_body
            .get("message")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            return message.to_string();
        }
    }

    let trimmed = body_text.trim();
    if trimmed.is_empty() {
        return format!("HTTP {}", status_code);
    }

    let shortened = if trimmed.chars().count() > 120 {
        format!("{}...", trimmed.chars().take(120).collect::<String>())
    } else {
        trimmed.to_string()
    };

    format!("HTTP {}: {}", status_code, shortened)
}

fn first_model_id(provider_object: &serde_json::Map<String, Value>) -> String {
    provider_object
        .get("models")
        .and_then(Value::as_array)
        .and_then(|models| models.first())
        .and_then(|model| model.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("default")
        .to_string()
}

fn install_openclaw_via_npm(
    openclaw_dir: &Path,
    version: &str,
    node_dir: &Path,
) -> anyhow::Result<()> {
    fs::create_dir_all(openclaw_dir)
        .with_context(|| format!("create openclaw dir {}", openclaw_dir.display()))?;

    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let npm_cmd = node_runtime_npm_command(node_dir);
    if !npm_cmd.exists() {
        anyhow::bail!("npm.cmd not found: {}", npm_cmd.display());
    }

    let output = background_command(process_friendly_path(&npm_cmd))
        .arg("install")
        .arg(format!("openclaw@{}", version))
        .arg("--prefix")
        .arg(process_friendly_path_string(openclaw_dir))
        // --legacy-peer-deps: npm/arborist peer 解析存在已知 bug
        // (Cannot read properties of null (reading 'edgesOut'))，跳过严格 peer 校验以规避。
        .args(["--legacy-peer-deps", "--no-audit", "--no-fund"])
        .env("NPM_CONFIG_USERCONFIG", node_runtime_npmrc_path(node_dir))
        .env("npm_config_userconfig", node_runtime_npmrc_path(node_dir))
        .output()
        .context("run npm install")?;

    if !output.status.success() {
        anyhow::bail!(
            "npm install failed with status {}{}",
            output.status,
            render_command_output(&output)
        );
    }

    Ok(())
}

fn ensure_openclaw_package_dependencies(
    openclaw_dir: &Path,
    node_dir: &Path,
    progress_callback: Option<&(dyn Fn(&str) + Sync)>,
) -> anyhow::Result<()> {
    let package_dir = openclaw_dir.join("package");
    if !package_dir.exists() {
        return Ok(());
    }

    let package_json = package_dir.join("package.json");
    if !package_json.exists() {
        anyhow::bail!(
            "openclaw package.json not found after archive install: {}",
            package_json.display()
        );
    }

    let node_modules_dir = package_dir.join("node_modules");
    if node_modules_dir.exists() {
        progress_callback
            .map(|callback| callback("检测到 package/node_modules 已存在，跳过依赖安装"));
        return Ok(());
    }

    install_openclaw_package_dependencies(&package_dir, node_dir, progress_callback)?;

    if !node_modules_dir.exists() {
        anyhow::bail!(
            "openclaw dependencies install completed but node_modules is still missing: {}",
            node_modules_dir.display()
        );
    }

    Ok(())
}

fn install_openclaw_package_dependencies(
    package_dir: &Path,
    node_dir: &Path,
    progress_callback: Option<&(dyn Fn(&str) + Sync)>,
) -> anyhow::Result<()> {
    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let npm_cmd = node_runtime_npm_command(node_dir);
    if !npm_cmd.exists() {
        anyhow::bail!("npm.cmd not found: {}", npm_cmd.display());
    }

    progress_callback.map(|callback| {
        callback("正在安装 OpenClaw 运行依赖，使用国内 npm 镜像源...");
    });
    let status = run_command_with_progress(
        package_dir,
        "run npm install for extracted openclaw package",
        &node_exe,
        progress_callback,
        &npm_cmd,
        &[
            "install",
            "--omit=dev",
            "--ignore-scripts",
            // --legacy-peer-deps: npm/arborist peer 解析存在已知 bug
            // (Cannot read properties of null (reading 'edgesOut'))，跳过严格 peer 校验以规避。
            "--legacy-peer-deps",
            "--no-audit",
            "--no-fund",
            "--verbose",
        ],
        true,
    )?;

    if !status.success() {
        anyhow::bail!(
            "npm install for extracted openclaw package failed with status {}",
            status
        );
    }

    let postinstall_script = package_dir
        .join("scripts")
        .join("postinstall-bundled-plugins.mjs");
    if postinstall_script.exists() {
        progress_callback.map(|callback| callback("正在执行 OpenClaw 内置插件补装脚本..."));
        let postinstall_script_arg = process_friendly_path_string(&postinstall_script);
        let status = run_command_with_progress(
            package_dir,
            "run openclaw postinstall-bundled-plugins",
            &node_exe,
            progress_callback,
            &node_exe,
            &[postinstall_script_arg.as_str()],
            false,
        )?;

        if !status.success() {
            anyhow::bail!(
                "openclaw postinstall-bundled-plugins failed with status {}",
                status
            );
        }
    }

    Ok(())
}

fn run_command_with_progress(
    working_dir: &Path,
    context_message: &str,
    node_exe: &Path,
    progress_callback: Option<&(dyn Fn(&str) + Sync)>,
    command: &Path,
    args: &[&str],
    ignore_scripts: bool,
) -> anyhow::Result<std::process::ExitStatus> {
    let mut command_builder = background_command(process_friendly_path(command));
    command_builder.args(args);
    apply_managed_node_command_env(
        &mut command_builder,
        working_dir,
        node_exe,
        true,
        true,
        Some(Stdio::piped()),
        Some(Stdio::piped()),
    );

    if ignore_scripts {
        command_builder.env("npm_config_ignore_scripts", "true");
    }

    let mut child = command_builder
        .spawn()
        .with_context(|| context_message.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let status = thread::scope(|scope| -> anyhow::Result<std::process::ExitStatus> {
        let stdout_task = stdout
            .map(|stream| scope.spawn(move || stream_lines(stream, progress_callback, false)));
        let stderr_task =
            stderr.map(|stream| scope.spawn(move || stream_lines(stream, progress_callback, true)));

        let status = child.wait().with_context(|| context_message.to_string())?;

        if let Some(task) = stdout_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("stdout log stream thread panicked"))?;
        }

        if let Some(task) = stderr_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("stderr log stream thread panicked"))?;
        }

        Ok(status)
    })?;

    Ok(status)
}

pub fn apply_managed_node_command_env(
    command: &mut Command,
    working_dir: &Path,
    node_exe: &Path,
    include_mirror_env: bool,
    augment_path: bool,
    stdout: Option<Stdio>,
    stderr: Option<Stdio>,
) {
    command.current_dir(process_friendly_path(working_dir));

    if include_mirror_env {
        let npmrc_path = node_runtime_npmrc_path(
            node_exe
                .parent()
                .and_then(Path::parent)
                .unwrap_or_else(|| node_exe.parent().unwrap_or(node_exe)),
        );
        command
            .env("NPM_CONFIG_USERCONFIG", &npmrc_path)
            .env("npm_config_userconfig", &npmrc_path)
            .env("npm_config_audit", "false")
            .env("npm_config_fund", "false")
            .env("npm_config_python", "python");
    }

    if augment_path {
        command.env("PATH", build_augmented_path_env(node_exe));
    }

    if let Some(stdout) = stdout {
        command.stdout(stdout);
    }

    if let Some(stderr) = stderr {
        command.stderr(stderr);
    }
}

fn stream_lines(
    stream: impl std::io::Read,
    progress_callback: Option<&(dyn Fn(&str) + Sync)>,
    is_stderr: bool,
) {
    let reader = BufReader::new(stream);
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(callback) = progress_callback {
            if should_surface_progress_line(trimmed) {
                let message = if is_stderr {
                    format!("依赖安装日志: {}", shorten_progress_line(trimmed))
                } else {
                    format!("依赖安装中: {}", shorten_progress_line(trimmed))
                };
                callback(&message);
            }
        }
    }
}

fn should_surface_progress_line(line: &str) -> bool {
    let lowered = line.to_ascii_lowercase();
    lowered.contains("npm http fetch")
        || lowered.contains("npm verbose")
        || lowered.contains("npm info")
        || lowered.contains("added ")
        || lowered.contains("changed ")
        || lowered.contains("audited ")
        || lowered.contains("reify")
        || lowered.contains("timing reify")
        || lowered.contains("postinstall")
        || lowered.contains("warn")
        || lowered.contains("error")
}

fn shorten_progress_line(line: &str) -> String {
    const MAX_CHARS: usize = 96;
    if line.chars().count() <= MAX_CHARS {
        return line.to_string();
    }

    let mut shortened = line.chars().take(MAX_CHARS).collect::<String>();
    shortened.push_str("...");
    shortened
}

fn build_augmented_path_env(node_exe: &Path) -> String {
    let mut paths = Vec::new();

    if let Some(parent) = node_exe.parent() {
        paths.push(process_friendly_path(parent));
    }

    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }

    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::{
        cell::Cell,
        fs,
        path::PathBuf,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    use serde_json::{json, Value};

    use super::{
        find_runtime_pid_in_netstat, gateway_port_from_url, normalize_plugin_discovery_cache_key,
        plugin_discovery_busy_error, read_openclaw_runtime_context, write_openclaw_config,
        PluginDiscoveryCache, PluginDiscoveryCacheLookup,
    };
    use crate::core::manifest::models::{
        ProviderCatalogEntry, ProviderModelCatalogEntry, ReleaseArtifact, RequiredNodeRuntime,
    };
    use crate::core::openclaw_cli::OpenClawPluginDiscovery;

    #[test]
    fn extracts_port_from_gateway_url_for_runtime_pid_lookup() {
        assert_eq!(gateway_port_from_url("http://127.0.0.1:19001"), Some(19001));
        assert_eq!(gateway_port_from_url("http://localhost"), Some(80));
        assert_eq!(gateway_port_from_url("not a url"), None);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ignores_non_listening_and_zero_pid_netstat_entries() {
        let output = concat!(
            "  TCP    127.0.0.1:18789     127.0.0.1:51234     TIME_WAIT       0\n",
            "  TCP    127.0.0.1:18789     0.0.0.0:0           LISTENING       4321\n"
        );

        assert_eq!(find_runtime_pid_in_netstat(18789, output), Some(4321));
    }

    #[test]
    fn generated_config_omits_root_version_field() {
        let temp_dir = unique_temp_dir("openclaw-config");
        let openclaw_dir = temp_dir.join("openclaw");
        fs::create_dir_all(&openclaw_dir).unwrap();
        let config_path = openclaw_dir.join("openclaw.json");
        let release = sample_release();

        write_openclaw_config(
            &config_path,
            &release,
            &release.skills,
            &openclaw_dir,
            &temp_dir.join("node"),
            &[sample_provider()],
        )
        .unwrap();

        let raw = fs::read_to_string(&config_path).unwrap();
        let json: Value = serde_json::from_str(&raw).unwrap();

        assert!(json.get("version").is_none());
        assert_eq!(
            json.get("gateway")
                .and_then(|gateway| gateway.get("port"))
                .and_then(Value::as_u64),
            Some(18789)
        );

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn generated_config_does_not_preconfigure_all_provider_secrets() {
        let temp_dir = unique_temp_dir("openclaw-config-empty-providers");
        let openclaw_dir = temp_dir.join("openclaw");
        fs::create_dir_all(&openclaw_dir).unwrap();
        let config_path = openclaw_dir.join("openclaw.json");
        let release = sample_release();

        write_openclaw_config(
            &config_path,
            &release,
            &release.skills,
            &openclaw_dir,
            &temp_dir.join("node"),
            &[sample_provider(), sample_qwen_provider()],
        )
        .unwrap();

        let raw = fs::read_to_string(&config_path).unwrap();
        let json: Value = serde_json::from_str(&raw).unwrap();

        assert_eq!(
            json.get("models")
                .and_then(|models| models.get("providers"))
                .and_then(Value::as_object)
                .map(|providers| providers.len()),
            Some(0)
        );
        assert_eq!(
            json.get("agents")
                .and_then(|agents| agents.get("defaults"))
                .and_then(|defaults| defaults.get("models"))
                .and_then(Value::as_object)
                .map(|models| models.keys().cloned().collect::<Vec<_>>()),
            Some(vec!["deepseek/deepseek-v4-pro".to_string()])
        );

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn runtime_context_reads_launch_paths_without_plugin_discovery() {
        let temp_dir = unique_temp_dir("openclaw-runtime-context");
        let openclaw_dir = temp_dir.join("openclaw");
        fs::create_dir_all(&openclaw_dir).unwrap();
        let config_path = openclaw_dir.join("openclaw.json");
        let node_dir = temp_dir.join("node");

        fs::write(
            &config_path,
            json!({ "gateway": { "port": 19001 } }).to_string(),
        )
        .unwrap();
        fs::write(
            openclaw_dir.join("installed-manifest.json"),
            json!({
                "toolkitVersion": "0.1.0",
                "openclawVersion": "2026.5.20",
                "nodeVersion": "22.19.0",
                "installMode": "archive",
                "installedAt": "2026-07-15T00:00:00Z",
                "openclawDir": openclaw_dir,
                "nodeDir": node_dir,
                "configPath": config_path,
            })
            .to_string(),
        )
        .unwrap();

        let context = read_openclaw_runtime_context(&config_path).unwrap();

        assert_eq!(context.node_dir, node_dir.to_string_lossy());
        assert_eq!(context.gateway_url, "http://127.0.0.1:19001");
        assert_eq!(
            context.runtime_log_path,
            openclaw_dir
                .join("logs")
                .join("gateway-runtime.log")
                .to_string_lossy()
        );

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn plugin_discovery_cache_reuses_discovery_for_unchanged_config_before_ttl() {
        let mut cache = PluginDiscoveryCache::default();
        let config_path = PathBuf::from("C:\\openclaw\\openclaw.json");
        let config_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let manifest_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(0);

        assert!(cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at,
                discovered_at,
            )
            .is_none());
        discovery_calls.set(discovery_calls.get() + 1);
        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            plugin_discovery("first"),
        );
        let second = cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at,
                discovered_at + Duration::from_secs(59),
            )
            .unwrap();

        assert_eq!(discovery_calls.get(), 1);
        assert_eq!(second.enabled_plugin_ids, vec!["first"]);
    }

    #[test]
    fn plugin_discovery_cache_normalizes_equivalent_config_paths() {
        let temp_dir = unique_temp_dir("plugin-discovery-cache-path");
        let config_dir = temp_dir.join("config");
        let config_path = config_dir.join("openclaw.json");
        let equivalent_config_path = config_dir
            .join(".")
            .join("equivalent")
            .join("..")
            .join("openclaw.json");
        let config_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let manifest_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(1);
        let mut cache = PluginDiscoveryCache::default();

        fs::create_dir_all(&config_dir).unwrap();
        fs::create_dir_all(config_dir.join("equivalent")).unwrap();
        fs::write(&config_path, "{}").unwrap();
        assert_ne!(config_path, equivalent_config_path);
        let config_key = normalize_plugin_discovery_cache_key(&config_path);
        let equivalent_key = normalize_plugin_discovery_cache_key(&equivalent_config_path);
        assert_eq!(config_key, equivalent_key);
        cache.insert(
            &config_key,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            plugin_discovery("first"),
        );

        let second = cache
            .get(
                &equivalent_key,
                config_modified_at,
                manifest_modified_at,
                discovered_at + Duration::from_secs(1),
            )
            .unwrap_or_else(|| {
                discovery_calls.set(discovery_calls.get() + 1);
                plugin_discovery("second")
            });

        assert_eq!(discovery_calls.get(), 1);
        assert_eq!(second.enabled_plugin_ids, vec!["first"]);

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn plugin_discovery_cache_prunes_expired_entries_when_reserving() {
        let mut cache = PluginDiscoveryCache::default();
        let first_key = PathBuf::from("C:\\openclaw\\first.json");
        let second_key = PathBuf::from("C:\\openclaw\\second.json");
        let modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();

        assert!(matches!(
            cache.lookup_or_reserve(&first_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.insert_and_release(
            &first_key,
            modified_at,
            modified_at,
            discovered_at,
            plugin_discovery("first"),
        );

        assert!(matches!(
            cache.lookup_or_reserve(
                &second_key,
                modified_at,
                modified_at,
                discovered_at + Duration::from_secs(60),
            ),
            PluginDiscoveryCacheLookup::Reserved
        ));
        assert!(!cache.entries.contains_key(&first_key));
        cache.release(&second_key);
    }

    #[test]
    fn plugin_discovery_cache_reserves_only_one_in_flight_discovery_per_key() {
        let mut cache = PluginDiscoveryCache::default();
        let config_key = PathBuf::from("C:\\openclaw\\openclaw.json");
        let modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(0);

        if matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ) {
            discovery_calls.set(discovery_calls.get() + 1);
        }
        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Busy
        ));

        assert_eq!(discovery_calls.get(), 1);
        cache.release(&config_key);
        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.release(&config_key);
    }

    #[test]
    fn plugin_discovery_cache_busy_error_preserves_status_fallback_path() {
        assert_eq!(
            plugin_discovery_busy_error().to_string(),
            "plugin discovery already in progress"
        );
    }

    #[test]
    fn plugin_discovery_cache_insert_and_release_allows_changed_config_reservation() {
        let mut cache = PluginDiscoveryCache::default();
        let config_key = PathBuf::from("C:\\openclaw\\openclaw.json");
        let modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();

        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.insert_and_release(
            &config_key,
            modified_at,
            modified_at,
            discovered_at,
            plugin_discovery("first"),
        );

        assert!(matches!(
            cache.lookup_or_reserve(
                &config_key,
                modified_at + Duration::from_secs(1),
                modified_at,
                discovered_at + Duration::from_secs(1),
            ),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.release(&config_key);
    }

    #[test]
    fn plugin_discovery_cache_release_allows_retry_after_failed_discovery() {
        let mut cache = PluginDiscoveryCache::default();
        let config_key = PathBuf::from("C:\\openclaw\\openclaw.json");
        let modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();

        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.release(&config_key);

        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.release(&config_key);
    }

    #[test]
    fn plugin_discovery_cache_accepts_keys_normalized_before_locking() {
        let temp_dir = unique_temp_dir("plugin-discovery-cache-normalized-key");
        let config_dir = temp_dir.join("config");
        let config_path = config_dir.join("openclaw.json");
        let equivalent_config_path = config_dir
            .join(".")
            .join("equivalent")
            .join("..")
            .join("openclaw.json");
        let modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();

        fs::create_dir_all(config_dir.join("equivalent")).unwrap();
        fs::write(&config_path, "{}").unwrap();
        let config_key = normalize_plugin_discovery_cache_key(&config_path);
        let equivalent_key = normalize_plugin_discovery_cache_key(&equivalent_config_path);
        assert_eq!(config_key, equivalent_key);

        let mut cache = PluginDiscoveryCache::default();
        assert!(matches!(
            cache.lookup_or_reserve(&config_key, modified_at, modified_at, discovered_at),
            PluginDiscoveryCacheLookup::Reserved
        ));
        cache.insert_and_release(
            &config_key,
            modified_at,
            modified_at,
            discovered_at,
            plugin_discovery("first"),
        );
        assert!(matches!(
            cache.lookup_or_reserve(
                &equivalent_key,
                modified_at,
                modified_at,
                discovered_at + Duration::from_secs(1),
            ),
            PluginDiscoveryCacheLookup::Hit(ref discovery) if discovery.enabled_plugin_ids == ["first"]
        ));

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn plugin_discovery_cache_refreshes_discovery_at_ttl_expiry() {
        let mut cache = PluginDiscoveryCache::default();
        let config_path = PathBuf::from("C:\\openclaw\\openclaw.json");
        let config_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let manifest_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(1);

        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            plugin_discovery("first"),
        );
        assert!(cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at,
                discovered_at + Duration::from_secs(60),
            )
            .is_none());
        discovery_calls.set(discovery_calls.get() + 1);
        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at,
            discovered_at + Duration::from_secs(60),
            plugin_discovery("refreshed"),
        );

        let refreshed = cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at,
                discovered_at + Duration::from_secs(60),
            )
            .unwrap();

        assert_eq!(discovery_calls.get(), 2);
        assert_eq!(refreshed.enabled_plugin_ids, vec!["refreshed"]);
    }

    #[test]
    fn plugin_discovery_cache_refreshes_discovery_after_config_modification() {
        let mut cache = PluginDiscoveryCache::default();
        let config_path = PathBuf::from("C:\\openclaw\\openclaw.json");
        let config_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let manifest_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(0);

        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            plugin_discovery("first"),
        );
        assert!(cache
            .get(
                &config_path,
                config_modified_at + Duration::from_secs(1),
                manifest_modified_at,
                discovered_at + Duration::from_secs(1),
            )
            .is_none());
        discovery_calls.set(discovery_calls.get() + 1);
        cache.insert(
            &config_path,
            config_modified_at + Duration::from_secs(1),
            manifest_modified_at,
            discovered_at + Duration::from_secs(1),
            plugin_discovery("refreshed"),
        );
        let refreshed = cache
            .get(
                &config_path,
                config_modified_at + Duration::from_secs(1),
                manifest_modified_at,
                discovered_at + Duration::from_secs(1),
            )
            .unwrap();

        assert_eq!(discovery_calls.get(), 1);
        assert_eq!(refreshed.enabled_plugin_ids, vec!["refreshed"]);
    }

    #[test]
    fn plugin_discovery_cache_refreshes_discovery_after_manifest_modification() {
        let mut cache = PluginDiscoveryCache::default();
        let config_path = PathBuf::from("C:\\openclaw\\openclaw.json");
        let config_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let manifest_modified_at = SystemTime::UNIX_EPOCH + Duration::from_secs(1);
        let discovered_at = Instant::now();
        let discovery_calls = Cell::new(0);

        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at,
            discovered_at,
            plugin_discovery("first"),
        );
        assert!(cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at + Duration::from_secs(1),
                discovered_at + Duration::from_secs(1),
            )
            .is_none());
        discovery_calls.set(discovery_calls.get() + 1);
        cache.insert(
            &config_path,
            config_modified_at,
            manifest_modified_at + Duration::from_secs(1),
            discovered_at + Duration::from_secs(1),
            plugin_discovery("refreshed"),
        );

        let refreshed = cache
            .get(
                &config_path,
                config_modified_at,
                manifest_modified_at + Duration::from_secs(1),
                discovered_at + Duration::from_secs(1),
            )
            .unwrap();

        assert_eq!(discovery_calls.get(), 1);
        assert_eq!(refreshed.enabled_plugin_ids, vec!["refreshed"]);
    }

    fn plugin_discovery(id: &str) -> OpenClawPluginDiscovery {
        OpenClawPluginDiscovery {
            installed_plugins: Vec::new(),
            enabled_plugin_ids: vec![id.to_string()],
        }
    }

    fn sample_release() -> ReleaseArtifact {
        ReleaseArtifact {
            name: "openclaw".to_string(),
            version: "2026.5.20".to_string(),
            platform: "win-x64".to_string(),
            artifact: "openclaw-2026.5.20.tgz".to_string(),
            sha256: "sha256".to_string(),
            signature: None,
            required_node: RequiredNodeRuntime {
                version: "22.19.0".to_string(),
                range: ">=22.19.0 <23".to_string(),
                artifact: "node-v22.19.0-win-x64.zip".to_string(),
                sha256: "sha256".to_string(),
                signature: None,
            },
            skills: Vec::new(),
        }
    }

    fn sample_provider() -> ProviderCatalogEntry {
        ProviderCatalogEntry {
            id: "deepseek".to_string(),
            label: "DeepSeek".to_string(),
            api: "openai-completions".to_string(),
            base_url: "https://api.deepseek.com/v1".to_string(),
            default_model: "deepseek/deepseek-v4-pro".to_string(),
            api_key_env: Some("DEEPSEEK_API_KEY".to_string()),
            aliases: Vec::new(),
            models: vec![ProviderModelCatalogEntry {
                id: "deepseek-v4-pro".to_string(),
                name: "DeepSeek V4 Pro".to_string(),
                input: vec!["text".to_string()],
                context_window: Some(1024000),
                max_tokens: Some(65536),
            }],
        }
    }

    fn sample_qwen_provider() -> ProviderCatalogEntry {
        ProviderCatalogEntry {
            id: "qwen".to_string(),
            label: "Qwen".to_string(),
            api: "openai-completions".to_string(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
            default_model: "qwen/qwen3-coder-plus".to_string(),
            api_key_env: Some("DASHSCOPE_API_KEY".to_string()),
            aliases: vec!["dashscope".to_string()],
            models: vec![ProviderModelCatalogEntry {
                id: "qwen3-coder-plus".to_string(),
                name: "Qwen3 Coder Plus".to_string(),
                input: vec!["text".to_string()],
                context_window: Some(262144),
                max_tokens: Some(32768),
            }],
        }
    }

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("openclaw-{label}-{suffix}"))
    }
}
