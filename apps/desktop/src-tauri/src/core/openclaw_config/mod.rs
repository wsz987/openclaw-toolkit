use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::core::{
    artifact::{install_archive, verify_sha256},
    manifest::models::ReleaseArtifact,
    node_runtime::node_runtime_executable,
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
    pub feishu_plugin_enabled: bool,
    pub skills_installed: Vec<String>,
    pub plugins_enabled: Vec<String>,
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
const DEFAULT_VOLCENGINE_API_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_VOLCENGINE_PLAN_API_URL: &str = "https://ark.cn-beijing.volces.com/api/coding/v3";
const DEFAULT_VOLCENGINE_MODEL: &str = "volcengine-plan/ark-code-latest";
const DEFAULT_OPENAI_PROVIDER_API: &str = "openai-completions";

pub fn openclaw_dir(base_dir: &Path, release: &ReleaseArtifact) -> PathBuf {
    base_dir.join("openclaw").join(&release.version)
}

pub fn install_openclaw(project_root: &Path, base_dir: &Path, release: &ReleaseArtifact, install_mode: &str, node_dir: &Path, remote_base_url: Option<&str>) -> anyhow::Result<PathBuf> {
    let openclaw_dir = openclaw_dir(base_dir, release);

    if install_mode == "npm" {
        install_openclaw_via_npm(&openclaw_dir, &release.version, node_dir)?;
    } else {
        let artifact_path = if let Some(remote_base_url) = remote_base_url {
            let cache_path = base_dir.join("downloads").join("openclaw").join(&release.artifact);
            download_remote_file(remote_base_url, &format!("artifacts/openclaw/{}", release.artifact), &cache_path)?;
            cache_path
        } else {
            project_root.join("artifacts").join("openclaw").join(&release.artifact)
        };

        if !artifact_path.exists() {
            anyhow::bail!("openclaw artifact not found: {}", artifact_path.display());
        }

        verify_sha256(&artifact_path, &release.sha256)?;
        install_archive(&artifact_path, &openclaw_dir)?;
    }

    if !openclaw_dir.exists() {
        anyhow::bail!("openclaw install failed: {}", openclaw_dir.display());
    }

    Ok(openclaw_dir)
}

pub fn write_openclaw_config(config_path: &Path, release: &ReleaseArtifact, tier: &str, openclaw_dir: &Path, node_dir: &Path) -> anyhow::Result<()> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create config dir {}", parent.display()))?;
    }

    let workspace_dir = openclaw_dir.join("workspace");
    let config_dir = openclaw_dir.join("config");
    let providers = json!({
        "volcengine": {
            "api": DEFAULT_OPENAI_PROVIDER_API,
            "baseUrl": DEFAULT_VOLCENGINE_API_URL,
            "apiKey": "${VOLCANO_ENGINE_API_KEY}",
            "models": [
                { "id": "doubao-seed-1-8-251228", "name": "Doubao Seed 1.8", "input": ["text", "image"] },
                { "id": "doubao-seed-code-preview-251028", "name": "Doubao Seed Code Preview", "input": ["text", "image"] },
                { "id": "kimi-k2-5-260127", "name": "Kimi K2.5", "input": ["text", "image"] },
                { "id": "glm-4-7-251222", "name": "GLM 4.7", "input": ["text", "image"] },
                { "id": "deepseek-v3-2-251201", "name": "DeepSeek V3.2", "input": ["text", "image"] }
            ]
        },
        "volcengine-plan": {
            "api": DEFAULT_OPENAI_PROVIDER_API,
            "baseUrl": DEFAULT_VOLCENGINE_PLAN_API_URL,
            "apiKey": "${VOLCANO_ENGINE_API_KEY}",
            "models": [
                { "id": "ark-code-latest", "name": "Ark Coding Plan" },
                { "id": "doubao-seed-code", "name": "Doubao Seed Code" },
                { "id": "kimi-k2.5", "name": "Kimi K2.5 Coding" },
                { "id": "kimi-k2-thinking", "name": "Kimi K2 Thinking" },
                { "id": "glm-4.7", "name": "GLM 4.7 Coding" }
            ]
        }
    });

    let config = json!({
        "version": 1,
        "openclawVersion": release.version,
        "tier": tier,
        "gateway": {
            "mode": DEFAULT_GATEWAY_MODE,
            "bind": DEFAULT_GATEWAY_BIND,
            "port": DEFAULT_GATEWAY_PORT,
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
                    "primary": DEFAULT_VOLCENGINE_MODEL
                },
                "workspace": workspace_dir.to_string_lossy(),
                "heartbeat": {
                    "every": "0m"
                }
            }
        },
        "runtime": {
            "workspaceDir": workspace_dir.to_string_lossy(),
            "nodeDir": node_dir.to_string_lossy()
        },
        "permissions": {
            "filesystem": {
                "allowRead": [workspace_dir.to_string_lossy(), config_dir.to_string_lossy()],
                "allowWrite": [workspace_dir.to_string_lossy()],
                "deny": ["C:\\Windows", "C:\\Program Files"]
            },
            "shell": {
                "enabled": true,
                "allowCommands": ["node", "npm", "openclaw", "powershell"],
                "denyPatterns": ["Remove-Item\\s+-Recurse", "format\\s+", "reg\\s+delete", "net\\s+user"]
            },
            "browser": {
                "enabled": true,
                "mode": "managed-edge",
                "allowDomains": ["localhost", "*.intranet.local"]
            }
        },
        "skills": release.skills,
        "models": {
            "mode": "merge",
            "providers": providers
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
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let workspace_dir = string_at_path(&config, &["runtime", "workspaceDir"])
        .unwrap_or_else(|| openclaw_dir.join("workspace").to_string_lossy().to_string());
    let node_dir = string_at_path(&config, &["runtime", "nodeDir"]).unwrap_or_default();
    let gateway_port = number_at_path(&config, &["gateway", "port"]).unwrap_or(DEFAULT_GATEWAY_PORT as u64);
    let control_ui_url = format!("http://127.0.0.1:{gateway_port}/");
    let provider_id = infer_primary_provider_id(&config);
    let provider_api_url = provider_id
        .as_deref()
        .and_then(|provider| string_at_path(&config, &["models", "providers", provider, "baseUrl"]));
    let provider_initialized = provider_id
        .as_deref()
        .and_then(|provider| string_at_path(&config, &["models", "providers", provider, "apiKey"]))
        .map(|value| !value.trim().is_empty() && !value.contains("${"))
        .unwrap_or(false);

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
        feishu_plugin_enabled: bool_at_path(&config, &["plugins", "entries", DEFAULT_FEISHU_PLUGIN_ID, "enabled"]).unwrap_or(false),
        skills_installed: string_array_at_path(&config, &["skills"]),
        plugins_enabled: enabled_plugin_ids(&config),
    })
}

pub fn apply_provider_setup(input: &ProviderSetupInput) -> anyhow::Result<ProviderSetupResult> {
    let config_path = PathBuf::from(&input.config_path);
    let mut config = read_openclaw_config_value(&config_path)?;
    let provider = normalize_provider_choice(&input.provider_id)?;
    let api_url = resolve_provider_api_url(&provider, input.api_url.as_deref());
    let primary_model = input
        .primary_model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default_model_for_provider(&provider).to_string());

    set_value_at_path(&mut config, &["agents", "defaults", "model", "primary"], Value::String(primary_model.clone()));
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.config_key, "baseUrl"],
        Value::String(api_url.clone()),
    );
    set_value_at_path(
        &mut config,
        &["models", "providers", provider.config_key, "apiKey"],
        Value::String(input.api_key.clone()),
    );

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
        provider_id: provider.response_id.to_string(),
        primary_model,
        api_url,
        feishu_plugin_enabled: input.enable_feishu_plugin,
        agent_permissions_granted: input.grant_agent_permissions,
    })
}

fn read_openclaw_config_value(config_path: &Path) -> anyhow::Result<Value> {
    let raw = fs::read_to_string(config_path).with_context(|| format!("read {}", config_path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", config_path.display()))
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
            item.as_str()
                .map(ToString::to_string)
                .or_else(|| item.get("name").and_then(Value::as_str).map(ToString::to_string))
        })
        .collect()
}

fn enabled_plugin_ids(value: &Value) -> Vec<String> {
    let Some(entries) = value_at_path(value, &["plugins", "entries"]).and_then(Value::as_object) else {
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
        current = object.entry((*segment).to_string()).or_insert_with(|| json!({}));
    }

    if !current.is_object() {
        *current = json!({});
    }

    let object = current.as_object_mut().expect("object ensured");
    object.insert(path[path.len() - 1].to_string(), value);
}

fn merge_agent_permissions(config: &mut Value) {
    let workspace_dir = string_at_path(config, &["runtime", "workspaceDir"]).unwrap_or_else(|| ".".to_string());
    let config_dir = Path::new(&workspace_dir)
        .parent()
        .map(|path| path.join("config").to_string_lossy().to_string())
        .unwrap_or_else(|| workspace_dir.clone());

    set_value_at_path(
        config,
        &["permissions", "filesystem", "allowRead"],
        json!([workspace_dir, config_dir]),
    );
    set_value_at_path(
        config,
        &["permissions", "filesystem", "allowWrite"],
        json!([workspace_dir]),
    );
    set_value_at_path(
        config,
        &["permissions", "shell", "enabled"],
        Value::Bool(true),
    );
    set_value_at_path(
        config,
        &["permissions", "browser", "enabled"],
        Value::Bool(true),
    );
}

struct ProviderChoice<'a> {
    config_key: &'a str,
    response_id: &'a str,
}

fn normalize_provider_choice(provider_id: &str) -> anyhow::Result<ProviderChoice<'static>> {
    match provider_id.trim() {
        "volcengine" => Ok(ProviderChoice {
            config_key: "volcengine",
            response_id: "volcengine",
        }),
        "volcengine-plan" | "ark-plan" => Ok(ProviderChoice {
            config_key: "volcengine-plan",
            response_id: "volcengine-plan",
        }),
        other => anyhow::bail!("unsupported provider: {other}"),
    }
}

fn resolve_provider_api_url(provider: &ProviderChoice<'_>, explicit: Option<&str>) -> String {
    if let Some(explicit) = explicit.map(str::trim).filter(|value| !value.is_empty()) {
        return explicit.to_string();
    }

    match provider.config_key {
        "volcengine-plan" => DEFAULT_VOLCENGINE_PLAN_API_URL.to_string(),
        _ => DEFAULT_VOLCENGINE_API_URL.to_string(),
    }
}

fn default_model_for_provider(provider: &ProviderChoice<'_>) -> &'static str {
    match provider.response_id {
        "volcengine-plan" => DEFAULT_VOLCENGINE_MODEL,
        _ => "volcengine/doubao-seed-1-8-251228",
    }
}

fn install_openclaw_via_npm(openclaw_dir: &Path, version: &str, node_dir: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(openclaw_dir).with_context(|| format!("create openclaw dir {}", openclaw_dir.display()))?;

    let node_exe = node_runtime_executable(node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let npm_cmd = node_dir.join("npm.cmd");
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
        ])
        .status()
        .context("run npm install")?;

    if !status.success() {
        anyhow::bail!("npm install failed with status {}", status);
    }

    Ok(())
}
