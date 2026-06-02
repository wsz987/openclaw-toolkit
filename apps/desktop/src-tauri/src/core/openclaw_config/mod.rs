use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::core::{
    artifact::{install_archive, verify_sha256},
    manifest::{
        load_provider_catalog_from_config_path,
        models::{ProviderCatalogEntry, ProviderModelCatalogEntry, ReleaseArtifact, ReleaseSkill},
    },
    node_runtime::{node_runtime_executable, node_runtime_npm_command},
    remote::download_remote_file,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawStatusSummary {
    pub openclaw_dir: String,
    pub node_dir: String,
    pub config_path: String,
    pub workspace_dir: String,
    pub gateway_url: String,
    pub control_ui_url: String,
    pub provider_initialized: bool,
    pub provider_id: Option<String>,
    pub provider_model: Option<String>,
    pub provider_api_url: Option<String>,
    pub available_providers: Vec<ProviderDescriptor>,
    pub feishu_plugin_enabled: bool,
    pub skills_installed: Vec<String>,
    pub plugins_enabled: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub enable_feishu_plugin: bool,
    pub grant_agent_permissions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSetupResult {
    pub config_path: String,
    pub provider_id: String,
    pub primary_model: String,
    pub api_url: String,
    pub feishu_plugin_enabled: bool,
    pub agent_permissions_granted: bool,
}

const DEFAULT_GATEWAY_PORT: u16 = 18789;
const DEFAULT_GATEWAY_BIND: &str = "loopback";
const DEFAULT_GATEWAY_MODE: &str = "local";
const DEFAULT_FEISHU_PLUGIN_ID: &str = "feishu";
const DEFAULT_BROWSER_PLUGIN_ID: &str = "browser";
const DEFAULT_OPENAI_PROVIDER_API: &str = "openai-completions";
const DEFAULT_NPM_REGISTRY_URL: &str = "https://registry.npmmirror.com";
const DEFAULT_NODE_DIST_MIRROR_URL: &str = "https://npmmirror.com/mirrors/node";
const DEFAULT_AGENT_SKILLS: [&str; 2] = ["browser-control", "local-filesystem"];

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
    release: &ReleaseArtifact,
    _tier: &str,
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
    let providers = provider_catalog_json(&provider_catalog);
    let default_provider = provider_catalog
        .first()
        .cloned()
        .unwrap_or_else(fallback_provider_entry);

    let default_agent_models = default_agent_models_map(&provider_catalog);
    let default_skills = default_skill_allowlist(&release.skills);

    let config = json!({
        "version": 1,
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
                "skills": default_skills,
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
            "providers": providers
        },
        "skills": {
            "load": {
                "extraDirs": [openclaw_dir.join("skills").to_string_lossy()]
            }
        },
        "plugins": {
            "entries": {
                DEFAULT_BROWSER_PLUGIN_ID: {
                    "enabled": true
                },
                DEFAULT_FEISHU_PLUGIN_ID: {
                    "enabled": false
                }
            }
        }
    });

    fs::write(config_path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

pub fn read_openclaw_status(config_path: &Path) -> anyhow::Result<OpenClawStatusSummary> {
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

    Ok(OpenClawStatusSummary {
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        node_dir,
        config_path: config_path.to_string_lossy().to_string(),
        workspace_dir,
        gateway_url: format!("http://127.0.0.1:{gateway_port}"),
        control_ui_url,
        provider_initialized,
        provider_id,
        provider_model: string_at_path(&config, &["agents", "defaults", "model", "primary"]),
        provider_api_url,
        available_providers,
        feishu_plugin_enabled: bool_at_path(
            &config,
            &["plugins", "entries", DEFAULT_FEISHU_PLUGIN_ID, "enabled"],
        )
        .unwrap_or(false),
        skills_installed: string_array_at_path(&config, &["agents", "defaults", "skills"]),
        plugins_enabled: enabled_plugin_ids(&config),
    })
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

    set_value_at_path(
        &mut config,
        &["agents", "defaults", "model", "primary"],
        Value::String(primary_model.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "baseUrl"],
        Value::String(api_url.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.id.as_str(), "apiKey"],
        Value::String(input.api_key.clone()),
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
    let merged_catalog = merge_provider_catalog(&manifest_catalog, &config);
    let agent_models = default_agent_models_map_from_descriptors(&merged_catalog);
    set_value_at_path(&mut config, &["agents", "defaults", "models"], agent_models);

    if input.grant_agent_permissions {
        merge_agent_permissions(&mut config);
    }

    if input.enable_feishu_plugin {
        set_value_at_path(
            &mut config,
            &["plugins", "entries", DEFAULT_FEISHU_PLUGIN_ID, "enabled"],
            Value::Bool(true),
        );
    }

    write_config_value(&config_path, &config)?;

    Ok(ProviderSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        provider_id: provider.id,
        primary_model,
        api_url,
        feishu_plugin_enabled: input.enable_feishu_plugin,
        agent_permissions_granted: input.grant_agent_permissions,
    })
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
    set_value_at_path(
        config,
        &["tools", "deny"],
        json!(["browser", "canvas"]),
    );
    set_value_at_path(
        config,
        &["tools", "fs", "workspaceOnly"],
        Value::Bool(true),
    );
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

fn default_skill_allowlist(skills: &[ReleaseSkill]) -> Value {
    let names: Vec<String> = skills
        .iter()
        .map(|skill| skill.name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();

    let fallback: Vec<String> = DEFAULT_AGENT_SKILLS
        .iter()
        .map(|skill| skill.to_string())
        .collect();

    json!(if names.is_empty() { fallback } else { names })
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

fn default_provider_catalog(provider_catalog: &[ProviderCatalogEntry]) -> Vec<ProviderCatalogEntry> {
    if provider_catalog.is_empty() {
        return vec![fallback_provider_entry()];
    }

    provider_catalog.to_vec()
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

    let Some(config_providers) = value_at_path(config, &["models", "providers"]).and_then(Value::as_object)
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

        if let Some(existing) = merged.iter_mut().find(|provider| provider.id == *provider_id) {
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
        other => format!("{}_API_KEY", other.to_ascii_uppercase().replace('-', "_")),
    }
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

    let status = Command::new("cmd")
        .args([
            "/C",
            npm_cmd.to_string_lossy().as_ref(),
            "install",
            &format!("openclaw@{}", version),
            "--prefix",
            &openclaw_dir.to_string_lossy(),
            "--no-audit",
            "--no-fund",
            "--registry",
            DEFAULT_NPM_REGISTRY_URL,
        ])
        .env("npm_config_registry", DEFAULT_NPM_REGISTRY_URL)
        .status()
        .context("run npm install")?;

    if !status.success() {
        anyhow::bail!("npm install failed with status {}", status);
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
        "cmd",
        &[
            "/C",
            npm_cmd.to_string_lossy().as_ref(),
            "install",
            "--omit=dev",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--registry",
            DEFAULT_NPM_REGISTRY_URL,
            "--verbose",
        ],
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
        let status = run_command_with_progress(
            package_dir,
            "run openclaw postinstall-bundled-plugins",
            &node_exe,
            progress_callback,
            node_exe.to_string_lossy().as_ref(),
            &[postinstall_script.to_string_lossy().as_ref()],
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
    command: &str,
    args: &[&str],
) -> anyhow::Result<std::process::ExitStatus> {
    let mut child = Command::new(command)
        .args(args)
        .current_dir(working_dir)
        .env("npm_config_registry", DEFAULT_NPM_REGISTRY_URL)
        .env("npm_config_audit", "false")
        .env("npm_config_fund", "false")
        .env("npm_config_ignore_scripts", "true")
        .env("npm_config_disturl", DEFAULT_NODE_DIST_MIRROR_URL)
        .env("npm_config_runtime_mirror", DEFAULT_NODE_DIST_MIRROR_URL)
        .env("NODEJS_ORG_MIRROR", DEFAULT_NODE_DIST_MIRROR_URL)
        .env("NVM_NODEJS_ORG_MIRROR", DEFAULT_NODE_DIST_MIRROR_URL)
        .env("ELECTRON_MIRROR", "https://npmmirror.com/mirrors/electron/")
        .env(
            "PLAYWRIGHT_DOWNLOAD_HOST",
            "https://npmmirror.com/mirrors/playwright",
        )
        .env("npm_config_python", "python")
        .env("PATH", build_augmented_path_env(node_exe))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| context_message.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let status = thread::scope(|scope| -> anyhow::Result<std::process::ExitStatus> {
        let stdout_task = stdout
            .map(|stream| scope.spawn(move || stream_lines(stream, progress_callback, false)));
        let stderr_task = stderr
            .map(|stream| scope.spawn(move || stream_lines(stream, progress_callback, true)));

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
        paths.push(parent.to_path_buf());
    }

    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }

    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
