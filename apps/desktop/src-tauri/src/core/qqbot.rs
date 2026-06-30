//! QQ Bot 通道——QQ 开放平台扫码登录 + AppID/AppSecret 凭证管理。
//!
//! 整体设计参考微信 / 钉钉通道：
//! - 微信：直接复用官方 `openclaw-weixin` 插件的二维码协议，桌面端获取二维码并长轮询状态。
//! - 钉钉：调用钉钉官方 device flow，生成二维码、手机扫码授权，成功后自动回填凭证。
//!
//! QQ Bot 同样从官方平台协议搞到二维码：调用 QQ 互联 ptlogin2 扫码登录接口，
//! 用户用手机 QQ 扫码登录 QQ 开放平台。登录成功后引导用户前往机器人管理页创建机器人并获取
//! AppID / AppSecret，再在应用内表单中填入凭证完成通道配置。

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;
use base64::Engine;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::core::{
    openclaw_cli::{read_plugin_discovery, OpenClawCliContext},
    openclaw_config::ensure_plugins_allowlist_entry,
};

const QQBOT_PLUGIN_ID: &str = "qqbot";
const QQBOT_PLUGIN_PACKAGE: &str = "@tencent-connect/openclaw-qqbot";
const QQBOT_PLUGIN_ENTRY_ID: &str = "openclaw-qqbot";
const QQBOT_CHANNEL_CONFIG_KEY: &str = "qqbot";
const QQBOT_LEGACY_CHANNEL_CONFIG_KEY: &str = "openclaw-qqbot";

/// QQ 开放平台扫码登录所使用的 ptlogin2 appid（q.qq.com）。
const QQ_LOGIN_AID: u64 = 716027609;
const QQ_LOGIN_DAID: u64 = 383;
const QQ_LOGIN_STYLE: u64 = 40;
const QQ_LOGIN_REDIRECT_URL: &str = "https://q.qq.com/";

/// ptlogin2 扫码登录相关域名。
const PTLOGIN_BASE_URL: &str = "https://ssl.ptlogin2.qq.com";
const PTLOGIN_XLOGIN_URL: &str = "https://xui.ptlogin2.qq.com/cgi-bin/xlogin";

/// 二维码展示倒计时（秒）。ptlogin2 二维码实际有效期约 2 分钟，这里取保守值。
const QQBOT_QR_DISPLAY_TTL_SECS: u64 = 120;
/// 活跃登录会话的 TTL（毫秒），超时后自动清理。
const QQBOT_ACTIVE_LOGIN_TTL_MS: u64 = 3 * 60_000;
/// 长轮询超时（毫秒）。
const QQBOT_QR_POLL_TIMEOUT_MS: u64 = 25_000;
/// 默认等待超时（毫秒）。
const QQBOT_DEFAULT_WAIT_TIMEOUT_MS: u64 = 240_000;

static QQBOT_LOGIN_SESSIONS: OnceLock<Mutex<HashMap<String, ActiveQqbotLogin>>> = OnceLock::new();

// ============================================================================
//  公开数据结构（序列化给前端）
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotChannelSummary {
    pub installed: bool,
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
    pub app_id: Option<String>,
    pub client_secret_configured: bool,
    pub dm_policy: String,
    pub allow_from: Vec<String>,
    pub group_policy: String,
    pub group_allow_from: Vec<String>,
    pub default_require_mention: bool,
    pub transport: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotLoginQrStartInput {
    pub config_path: String,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotLoginQrStartResult {
    pub session_key: String,
    /// 二维码图片的 data URL（base64 PNG），前端直接展示。
    pub qr_data_url: Option<String>,
    /// 二维码对应的扫码登录页 URL（用于浏览器打开兜底）。
    pub qr_login_url: Option<String>,
    pub message: String,
    pub expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotLoginQrWaitInput {
    pub config_path: String,
    pub session_key: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotLoginQrWaitResult {
    /// 扫码登录成功（用户已登录 QQ 开放平台）。
    pub connected: bool,
    pub expired: bool,
    pub message: String,
    pub qr_data_url: Option<String>,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotChannelSetupInput {
    pub config_path: String,
    pub enabled: bool,
    pub app_id: Option<String>,
    pub client_secret: Option<String>,
    pub dm_policy: Option<String>,
    pub allow_from: Vec<String>,
    pub group_policy: Option<String>,
    pub group_allow_from: Vec<String>,
    pub default_require_mention: bool,
    pub transport: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotChannelSetupResult {
    pub config_path: String,
    pub enabled: bool,
    pub configured: bool,
    pub app_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotChannelToggleInput {
    pub config_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QqbotChannelToggleResult {
    pub config_path: String,
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
}

// ============================================================================
//  内部会话状态
// ============================================================================

#[derive(Debug, Clone)]
struct ActiveQqbotLogin {
    /// ptqrshow 返回的二维码 PNG（base64 data URL）。
    qr_data_url: String,
    /// 从 ptqrshow 响应 Set-Cookie 中提取的 qrsig。
    qrsig: String,
    /// 基于 qrsig 计算的 ptqrtoken。
    ptqrtoken: u32,
    /// 扫码登录页完整 URL（xlogin 渲染）。
    login_url: String,
    started_at: Instant,
}

// ============================================================================
//  通道状态读取
// ============================================================================

pub fn read_qqbot_channel_summary(config_path: &Path) -> anyhow::Result<QqbotChannelSummary> {
    let cli_context = openclaw_cli_context(config_path)?;
    let discovery = read_plugin_discovery(&cli_context).unwrap_or(
        crate::core::openclaw_cli::OpenClawPluginDiscovery {
            installed_plugins: Vec::new(),
            enabled_plugin_ids: Vec::new(),
        },
    );
    let config = read_openclaw_config_value(config_path)?;
    Ok(read_qqbot_channel_summary_from_config(&config, Some(&discovery)))
}

pub fn read_qqbot_channel_summary_from_config(
    config: &Value,
    discovery: Option<&crate::core::openclaw_cli::OpenClawPluginDiscovery>,
) -> QqbotChannelSummary {
    let app_id = string_at_channel_config_path(config, "appId");
    let client_secret_configured = string_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "clientSecret"],
    )
    .or_else(|| {
        string_at_path(
            config,
            &["channels", QQBOT_LEGACY_CHANNEL_CONFIG_KEY, "clientSecret"],
        )
    })
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);

    let installed = discovery
        .map(|entries| {
            entries.installed_plugins.iter().any(|plugin| {
                plugin.id.eq_ignore_ascii_case(QQBOT_PLUGIN_ENTRY_ID)
                    || plugin.id.eq_ignore_ascii_case(QQBOT_PLUGIN_ID)
                    || plugin
                        .package
                        .as_deref()
                        .map(|package| package.eq_ignore_ascii_case(QQBOT_PLUGIN_PACKAGE))
                        .unwrap_or(false)
            })
        })
        .unwrap_or_else(|| {
            bool_at_path(config, &["plugins", "entries", QQBOT_PLUGIN_ENTRY_ID, "enabled"])
                .unwrap_or(false)
        });

    let enabled = discovery
        .map(|entries| {
            entries
                .enabled_plugin_ids
                .iter()
                .any(|plugin_id| {
                    plugin_id.eq_ignore_ascii_case(QQBOT_PLUGIN_ENTRY_ID)
                        || plugin_id.eq_ignore_ascii_case(QQBOT_PLUGIN_ID)
                })
        })
        .unwrap_or(false)
        || bool_at_path(config, &["plugins", "entries", QQBOT_PLUGIN_ENTRY_ID, "enabled"])
            .unwrap_or(false)
        || bool_at_channel_config_path(config, "enabled").unwrap_or(false);

    let configured = app_id
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        && client_secret_configured;

    QqbotChannelSummary {
        installed,
        enabled,
        configured,
        account_id: "default".to_string(),
        app_id,
        client_secret_configured,
        dm_policy: string_at_channel_config_path(config, "dmPolicy")
            .unwrap_or_else(|| "open".to_string()),
        allow_from: {
            let allow_from = string_array_at_channel_config_path(config, "allowFrom");
            if allow_from.is_empty() {
                vec!["*".to_string()]
            } else {
                allow_from
            }
        },
        group_policy: string_at_channel_config_path(config, "groupPolicy")
            .unwrap_or_else(|| "open".to_string()),
        group_allow_from: string_array_at_channel_config_path(config, "groupAllowFrom"),
        default_require_mention: bool_at_channel_config_path(config, "defaultRequireMention")
            .unwrap_or(true),
        transport: string_at_channel_config_path(config, "transport")
            .unwrap_or_else(|| "websocket".to_string()),
    }
}

// ============================================================================
//  通道配置写入
// ============================================================================

pub fn apply_qqbot_channel_setup(
    input: &QqbotChannelSetupInput,
) -> anyhow::Result<QqbotChannelSetupResult> {
    let config_path = PathBuf::from(&input.config_path);
    if input.enabled {
        let _ = ensure_plugins_allowlist_entry(&config_path, QQBOT_PLUGIN_ENTRY_ID)?;
    }
    let mut config = read_openclaw_config_value(&config_path)?;
    apply_qqbot_channel_setup_to_config(&mut config, input);

    write_config_value(&config_path, &config)?;
    let summary = read_qqbot_channel_summary(&config_path)?;

    Ok(QqbotChannelSetupResult {
        config_path: config_path.to_string_lossy().to_string(),
        enabled: summary.enabled,
        configured: summary.configured,
        app_id: summary.app_id,
    })
}

fn apply_qqbot_channel_setup_to_config(config: &mut Value, input: &QqbotChannelSetupInput) {
    let account_id = "default";
    let dm_policy = normalize_non_empty(input.dm_policy.as_deref(), Some("open".to_string()));
    let group_policy =
        normalize_non_empty(input.group_policy.as_deref(), Some("open".to_string()));
    let allow_from = if dm_policy == "open" && input.allow_from.is_empty() {
        vec!["*".to_string()]
    } else {
        input.allow_from.clone()
    };
    let transport = normalize_non_empty(input.transport.as_deref(), Some("websocket".to_string()));
    let app_id = normalize_optional_non_empty(
        input.app_id.as_deref(),
        string_at_channel_config_path(config, "appId").as_deref(),
    );
    let client_secret = normalize_optional_non_empty(
        input.client_secret.as_deref(),
        string_at_channel_config_path(config, "clientSecret").as_deref(),
    );

    set_value_at_path(
        config,
        &["plugins", "entries", QQBOT_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "defaultAccount"],
        Value::String(account_id.to_string()),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "dmPolicy"],
        Value::String(dm_policy),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "allowFrom"],
        string_vec_to_value(&allow_from),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "groupPolicy"],
        Value::String(group_policy),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "groupAllowFrom"],
        string_vec_to_value(&input.group_allow_from),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "defaultRequireMention"],
        Value::Bool(input.default_require_mention),
    );
    set_value_at_path(
        config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "transport"],
        Value::String(transport),
    );

    if let Some(app_id) = app_id.clone() {
        set_value_at_path(
            config,
            &["channels", QQBOT_CHANNEL_CONFIG_KEY, "appId"],
            Value::String(app_id),
        );
    } else {
        remove_value_at_path(config, &["channels", QQBOT_CHANNEL_CONFIG_KEY, "appId"]);
    }

    if let Some(client_secret) = client_secret.clone() {
        set_value_at_path(
            config,
            &["channels", QQBOT_CHANNEL_CONFIG_KEY, "clientSecret"],
            Value::String(client_secret),
        );
    } else {
        remove_value_at_path(config, &["channels", QQBOT_CHANNEL_CONFIG_KEY, "clientSecret"]);
    }

    remove_value_at_path(config, &["channels", QQBOT_LEGACY_CHANNEL_CONFIG_KEY]);
}

pub fn apply_qqbot_channel_toggle(
    input: &QqbotChannelToggleInput,
) -> anyhow::Result<QqbotChannelToggleResult> {
    let config_path = PathBuf::from(&input.config_path);
    if input.enabled {
        let _ = ensure_plugins_allowlist_entry(&config_path, QQBOT_PLUGIN_ENTRY_ID)?;
    }
    let mut config = read_openclaw_config_value(&config_path)?;

    set_value_at_path(
        &mut config,
        &["plugins", "entries", QQBOT_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", QQBOT_CHANNEL_CONFIG_KEY, "channelConfigUpdatedAt"],
        Value::String(chrono::Utc::now().to_rfc3339()),
    );

    if value_at_path(&config, &["channels", QQBOT_CHANNEL_CONFIG_KEY, "defaultAccount"]).is_none()
    {
        set_value_at_path(
            &mut config,
            &["channels", QQBOT_CHANNEL_CONFIG_KEY, "defaultAccount"],
            Value::String("default".to_string()),
        );
    }

    write_config_value(&config_path, &config)?;
    let summary = read_qqbot_channel_summary(&config_path)?;
    Ok(QqbotChannelToggleResult {
        config_path: input.config_path.clone(),
        enabled: summary.enabled,
        configured: summary.configured,
        account_id: summary.account_id,
    })
}

// ============================================================================
//  QQ 开放平台扫码登录（ptlogin2）
// ============================================================================

pub fn start_qqbot_login_qr(input: &QqbotLoginQrStartInput) -> anyhow::Result<QqbotLoginQrStartResult> {
    let session_key = "default".to_string();
    purge_expired_sessions();

    if !input.force {
        if let Some(existing) = login_sessions()
            .lock()
            .map_err(|_| anyhow::anyhow!("QQ 登录会话状态异常"))?
            .get(&session_key)
            .cloned()
        {
            if is_login_fresh(&existing) {
                return Ok(QqbotLoginQrStartResult {
                    session_key,
                    qr_data_url: Some(existing.qr_data_url.clone()),
                    qr_login_url: Some(existing.login_url.clone()),
                    message: "二维码已生成，请继续使用手机 QQ 扫码登录。".to_string(),
                    expires_in: remaining_expires_in(&existing),
                });
            }
        }
    }

    let qr = fetch_qq_login_qrcode()?;
    let active = ActiveQqbotLogin {
        qr_data_url: qr.qr_data_url,
        qrsig: qr.qrsig,
        ptqrtoken: qr.ptqrtoken,
        login_url: qr.login_url,
        started_at: Instant::now(),
    };

    login_sessions()
        .lock()
        .map_err(|_| anyhow::anyhow!("QQ 登录会话状态异常"))?
        .insert(session_key.clone(), active.clone());

    Ok(QqbotLoginQrStartResult {
        session_key,
        qr_data_url: Some(active.qr_data_url),
        qr_login_url: Some(active.login_url),
        message: "请使用手机 QQ 扫描二维码以登录 QQ 开放平台。".to_string(),
        expires_in: QQBOT_QR_DISPLAY_TTL_SECS,
    })
}

pub fn wait_for_qqbot_login(input: &QqbotLoginQrWaitInput) -> anyhow::Result<QqbotLoginQrWaitResult> {
    let timeout_ms = input
        .timeout_ms
        .unwrap_or(QQBOT_DEFAULT_WAIT_TIMEOUT_MS)
        .max(1_000);
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let session_key = input.session_key.trim().to_string();

    loop {
        let outcome = step_qqbot_login_poll(&session_key)?;
        if outcome.connected || outcome.expired {
            return Ok(outcome);
        }

        if Instant::now() >= deadline {
            remove_login_session(&session_key);
            return Ok(QqbotLoginQrWaitResult {
                connected: false,
                expired: false,
                message: "登录超时，请重试。".to_string(),
                qr_data_url: None,
                expires_in: None,
            });
        }

        thread::sleep(Duration::from_secs(2));
    }
}

fn step_qqbot_login_poll(session_key: &str) -> anyhow::Result<QqbotLoginQrWaitResult> {
    let sessions = login_sessions()
        .lock()
        .map_err(|_| anyhow::anyhow!("QQ 登录会话状态异常"))?;
    let Some(active) = sessions.get(session_key).cloned() else {
        return Ok(QqbotLoginQrWaitResult {
            connected: false,
            expired: true,
            message: "当前没有进行中的 QQ 登录会话，请重新生成二维码。".to_string(),
            qr_data_url: None,
            expires_in: None,
        });
    };
    drop(sessions);

    if !is_login_fresh(&active) {
        remove_login_session(session_key);
        return Ok(QqbotLoginQrWaitResult {
            connected: false,
            expired: true,
            message: "二维码已失效，请重新生成。".to_string(),
            qr_data_url: None,
            expires_in: None,
        });
    }

    let status = poll_qq_login_status(&active)?;

    match status {
        QqLoginScanState::Waiting => Ok(QqbotLoginQrWaitResult {
            connected: false,
            expired: false,
            message: "等待扫码中。".to_string(),
            qr_data_url: Some(active.qr_data_url.clone()),
            expires_in: Some(remaining_expires_in(&active)),
        }),
        QqLoginScanState::Scanned => Ok(QqbotLoginQrWaitResult {
            connected: false,
            expired: false,
            message: "已扫码，请在手机上确认登录。".to_string(),
            qr_data_url: Some(active.qr_data_url.clone()),
            expires_in: Some(remaining_expires_in(&active)),
        }),
        QqLoginScanState::Success => {
            remove_login_session(session_key);
            Ok(QqbotLoginQrWaitResult {
                connected: true,
                expired: false,
                message: "QQ 开放平台登录成功！请前往机器人管理页创建机器人并获取 AppID / AppSecret。"
                    .to_string(),
                qr_data_url: None,
                expires_in: None,
            })
        }
        QqLoginScanState::Expired => {
            remove_login_session(session_key);
            Ok(QqbotLoginQrWaitResult {
                connected: false,
                expired: true,
                message: "二维码已过期，请重新生成。".to_string(),
                qr_data_url: None,
                expires_in: None,
            })
        }
    }
}

// ============================================================================
//  ptlogin2 HTTP 交互
// ============================================================================

struct QqLoginQr {
    qr_data_url: String,
    qrsig: String,
    ptqrtoken: u32,
    login_url: String,
}

fn fetch_qq_login_qrcode() -> anyhow::Result<QqLoginQr> {
    let client = reqwest_client()?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let random: u64 = (timestamp as u64).wrapping_mul(1000) % 1_000_000;

    // 1. 请求 xlogin 获取 pt_login_sig cookie（用于后续 ptqrlogin）
    let encoded_url = percent_encode(QQ_LOGIN_REDIRECT_URL);
    let xlogin_url = format!(
        "{PTLOGIN_XLOGIN_URL}?appid={QQ_LOGIN_AID}&daid={QQ_LOGIN_DAID}&qt=qrstyle%3D{QQ_LOGIN_STYLE}%26pt_aid%3D{QQ_LOGIN_AID}%26pt_daid%3D{QQ_LOGIN_DAID}&style={QQ_LOGIN_STYLE}&target=self&s_url={encoded_url}&proxy_url=https%3A//q.qq.com/proxy.html&pt_no_auth=1&pt_local_tk={timestamp}"
    );

    let xlogin_response = client
        .get(&xlogin_url)
        .header(reqwest::header::REFERER, "https://q.qq.com/")
        .send()
        .context("request ptlogin2 xlogin")?;
    let pt_login_sig = extract_cookie_value(&xlogin_response, "pt_login_sig")
        .unwrap_or_default();

    // 2. 请求 ptqrshow 获取二维码 PNG + qrsig cookie
    let ptqrshow_url = format!(
        "{PTLOGIN_BASE_URL}/ptqrshow?appid={QQ_LOGIN_AID}&e=2&l=M&s=3&d=72&v=4&t={random}&daid={QQ_LOGIN_DAID}&pt_3rd_aid=0"
    );

    let qr_response = client
        .get(&ptqrshow_url)
        .header(reqwest::header::REFERER, "https://xui.ptlogin2.qq.com/")
        .send()
        .context("request ptlogin2 ptqrshow")?;

    let qr_status = qr_response.status();
    let qrsig = extract_cookie_value_from_response(&qr_response, "qrsig")
        .context("ptqrshow 未返回 qrsig cookie")?;
    let qr_bytes = qr_response
        .bytes()
        .with_context(|| format!("read ptqrshow response: HTTP {qr_status}"))?;

    if !qr_status.is_success() || qr_bytes.len() < 8 {
        anyhow::bail!("获取 QQ 登录二维码失败: HTTP {}", qr_status.as_u16());
    }

    let ptqrtoken = hash33(&qrsig);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&qr_bytes);
    let qr_data_url = format!("data:image/png;base64,{b64}");

    let encoded_sig = percent_encode(&pt_login_sig);
    let login_url = format!(
        "{PTLOGIN_BASE_URL}/ptqrlogin?u1={encoded_url}&ptqrtoken={ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-{timestamp}&js_ver=10275&js_type=1&login_sig={encoded_sig}&pt_uistyle={QQ_LOGIN_STYLE}&aid={QQ_LOGIN_AID}&daid={QQ_LOGIN_DAID}&pt_3rd_aid=0"
    );

    Ok(QqLoginQr {
        qr_data_url,
        qrsig,
        ptqrtoken,
        login_url,
    })
}

enum QqLoginScanState {
    Waiting,
    Scanned,
    Success,
    Expired,
}

fn poll_qq_login_status(active: &ActiveQqbotLogin) -> anyhow::Result<QqLoginScanState> {
    let client = reqwest_client()?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let encoded_url = percent_encode(QQ_LOGIN_REDIRECT_URL);
    let poll_url = format!(
        "{PTLOGIN_BASE_URL}/ptqrlogin?u1={encoded_url}&ptqrtoken={ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-{timestamp}&js_ver=10275&js_type=1&pt_uistyle={QQ_LOGIN_STYLE}&aid={QQ_LOGIN_AID}&daid={QQ_LOGIN_DAID}&pt_3rd_aid=0",
        ptqrtoken = active.ptqrtoken,
    );

    let response = client
        .get(&poll_url)
        .header(reqwest::header::REFERER, "https://xui.ptlogin2.qq.com/")
        .header(reqwest::header::COOKIE, format!("qrsig={}", active.qrsig))
        .timeout(Duration::from_millis(QQBOT_QR_POLL_TIMEOUT_MS))
        .send();

    match response {
        Ok(response) => {
            let status = response.status();
            let body = response
                .text()
                .with_context(|| format!("read ptqrlogin response: HTTP {status}"))?;

            // ptuiCB(code,status,......)
            // code: 66=waiting, 67=scanned, 0=success, 65=expired
            let code = parse_ptui_cb_code(&body);
            Ok(match code {
                0 => QqLoginScanState::Success,
                67 => QqLoginScanState::Scanned,
                65 => QqLoginScanState::Expired,
                _ => QqLoginScanState::Waiting,
            })
        }
        Err(error) if error.is_timeout() => Ok(QqLoginScanState::Waiting),
        Err(error) => {
            eprintln!("[QQ 登录] QR 轮询异常，按 waiting 继续处理: {error}");
            Ok(QqLoginScanState::Waiting)
        }
    }
}

/// 从 `ptuiCB(66,'...',...)` 格式的回调中提取第一个数字参数。
fn parse_ptui_cb_code(body: &str) -> u32 {
    let start = body.find("ptuiCB(").or_else(|| body.find("ptui2CB("));
    let Some(start) = start else {
        return 66; // 默认 waiting
    };
    let rest = &body[start..];
    let paren_start = rest.find('(').unwrap_or(0);
    let rest = &rest[paren_start + 1..];
    let end = rest.find(',').unwrap_or(rest.len());
    let code_str = rest[..end].trim().trim_matches('\'').trim_matches('"');
    code_str.parse::<u32>().unwrap_or(66)
}

/// Tencent ptlogin2 使用的 hash33 算法，将 qrsig 转换为 ptqrtoken。
fn hash33(input: &str) -> u32 {
    let mut hash: u32 = 0;
    for ch in input.chars() {
        hash += (ch as u32) & 0xFFFF;
        hash = hash.wrapping_mul(33);
    }
    hash & 0x7FFFFFFF
}

fn extract_cookie_value(response: &reqwest::blocking::Response, name: &str) -> Option<String> {
    response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find_map(|cookie| parse_cookie(cookie, name))
}

fn extract_cookie_value_from_response(
    response: &reqwest::blocking::Response,
    name: &str,
) -> Option<String> {
    extract_cookie_value(response, name)
}

fn parse_cookie(cookie_str: &str, name: &str) -> Option<String> {
    cookie_str
        .split(';')
        .map(str::trim)
        .find_map(|part| {
            let mut iter = part.splitn(2, '=');
            let key = iter.next()?.trim();
            let value = iter.next()?.trim();
            if key.eq_ignore_ascii_case(name) {
                Some(value.to_string())
            } else {
                None
            }
        })
}

// ============================================================================
//  辅助函数
// ============================================================================

fn openclaw_cli_context(config_path: &Path) -> anyhow::Result<OpenClawCliContext> {
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
    let installed_manifest_raw = fs::read_to_string(&installed_manifest_path)
        .with_context(|| format!("read installed manifest {}", installed_manifest_path.display()))?;
    let installed_manifest: crate::core::manifest::models::InstalledManifest =
        serde_json::from_str(&installed_manifest_raw).with_context(|| {
            format!(
                "parse installed manifest {}",
                installed_manifest_path.display()
            )
        })?;
    Ok(OpenClawCliContext {
        openclaw_dir: openclaw_dir.to_path_buf(),
        config_path: config_path.to_path_buf(),
        node_dir: PathBuf::from(installed_manifest.node_dir),
    })
}

fn login_sessions() -> &'static Mutex<HashMap<String, ActiveQqbotLogin>> {
    QQBOT_LOGIN_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn purge_expired_sessions() {
    if let Ok(mut sessions) = login_sessions().lock() {
        sessions.retain(|_, session| is_login_fresh(session));
    }
}

fn remove_login_session(session_key: &str) {
    if let Ok(mut sessions) = login_sessions().lock() {
        sessions.remove(session_key);
    }
}

fn is_login_fresh(login: &ActiveQqbotLogin) -> bool {
    login.started_at.elapsed() < Duration::from_millis(QQBOT_ACTIVE_LOGIN_TTL_MS)
}

fn remaining_expires_in(login: &ActiveQqbotLogin) -> u64 {
    Duration::from_secs(QQBOT_QR_DISPLAY_TTL_SECS)
        .saturating_sub(login.started_at.elapsed())
        .as_secs()
        .max(1)
}

fn reqwest_client() -> anyhow::Result<Client> {
    Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_millis(QQBOT_QR_POLL_TIMEOUT_MS))
        .build()
        .context("build QQ Bot HTTP client")
}

fn normalize_non_empty(value: Option<&str>, default: Option<String>) -> String {
    let trimmed = value.unwrap_or_default().trim();
    if trimmed.is_empty() {
        default.unwrap_or_default()
    } else {
        trimmed.to_string()
    }
}

fn normalize_optional_non_empty(value: Option<&str>, existing: Option<&str>) -> Option<String> {
    let trimmed = value.map(|v| v.trim()).filter(|v| !v.is_empty());
    trimmed.map(ToString::to_string).or_else(|| {
        existing
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    })
}

fn read_openclaw_config_value(config_path: &Path) -> anyhow::Result<Value> {
    let raw = fs::read_to_string(config_path)
        .with_context(|| format!("read openclaw config {}", config_path.display()))?;
    serde_json::from_str(&raw)
        .with_context(|| format!("parse openclaw config {}", config_path.display()))
}

fn write_config_value(config_path: &Path, config: &Value) -> anyhow::Result<()> {
    fs::write(config_path, serde_json::to_string_pretty(config)?)
        .with_context(|| format!("write openclaw config {}", config_path.display()))
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn bool_at_path(value: &Value, path: &[&str]) -> Option<bool> {
    value_at_path(value, path).and_then(Value::as_bool)
}

fn string_array_at_path(value: &Value, path: &[&str]) -> Vec<String> {
    value_at_path(value, path)
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str().map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn value_at_channel_config_path<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    value_at_path(value, &["channels", QQBOT_CHANNEL_CONFIG_KEY, key]).or_else(|| {
        value_at_path(value, &["channels", QQBOT_LEGACY_CHANNEL_CONFIG_KEY, key])
    })
}

fn string_at_channel_config_path(value: &Value, key: &str) -> Option<String> {
    value_at_channel_config_path(value, key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn bool_at_channel_config_path(value: &Value, key: &str) -> Option<bool> {
    value_at_channel_config_path(value, key).and_then(Value::as_bool)
}

fn string_array_at_channel_config_path(value: &Value, key: &str) -> Vec<String> {
    value_at_channel_config_path(value, key)
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str().map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn set_value_at_path(root: &mut Value, path: &[&str], next_value: Value) {
    if path.is_empty() {
        *root = next_value;
        return;
    }

    let mut current = root;
    for segment in &path[..path.len() - 1] {
        if !current.is_object() {
            *current = json!({});
        }
        let object = current.as_object_mut().expect("value forced to object");
        current = object
            .entry((*segment).to_string())
            .or_insert_with(|| json!({}));
    }

    if !current.is_object() {
        *current = json!({});
    }
    let object = current.as_object_mut().expect("value forced to object");
    object.insert(path[path.len() - 1].to_string(), next_value);
}

fn remove_value_at_path(root: &mut Value, path: &[&str]) {
    if path.is_empty() {
        return;
    }
    let mut current = root;
    for segment in &path[..path.len() - 1] {
        current = match current.get_mut(*segment) {
            Some(value) if value.is_object() => value,
            _ => return,
        };
    }
    if let Some(object) = current.as_object_mut() {
        object.remove(path[path.len() - 1]);
    }
}

fn string_vec_to_value(values: &[String]) -> Value {
    Value::Array(values.iter().map(|v| Value::String(v.clone())).collect())
}

/// 简易百分号编码，仅编码 URL 中不安全的字符。
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for &byte in input.as_bytes() {
        let ch = byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            out.push(ch);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

/// 刷新 QQ Bot 通道摘要到 status（供 read_openclaw_status 调用）。
pub fn apply_qqbot_status_to_summary(
    status: &mut crate::core::openclaw_config::OpenClawStatusSummary,
    config_path: &Path,
) -> anyhow::Result<()> {
    status.qqbot_channel = read_qqbot_channel_summary(config_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        apply_qqbot_channel_setup_to_config, bool_at_path, read_qqbot_channel_summary_from_config,
        string_at_path, value_at_path, QqbotChannelSetupInput, QQ_LOGIN_DAID,
    };

    #[test]
    fn qq_open_platform_login_uses_current_daid_for_q_dot_qq_dot_com() {
        assert_eq!(QQ_LOGIN_DAID, 383);
    }

    #[test]
    fn channel_summary_reads_official_qqbot_config_key() {
        let config = json!({
            "plugins": {
                "entries": {
                    "openclaw-qqbot": { "enabled": true }
                }
            },
            "channels": {
                "qqbot": {
                    "enabled": true,
                    "appId": "123456",
                    "clientSecret": "secret",
                    "dmPolicy": "allowlist",
                    "allowFrom": ["USER_A"],
                    "groupPolicy": "allowlist",
                    "groupAllowFrom": ["GROUP_A"],
                    "defaultRequireMention": false,
                    "transport": "webhook"
                }
            }
        });

        let summary = read_qqbot_channel_summary_from_config(&config, None);

        assert!(summary.enabled);
        assert!(summary.configured);
        assert_eq!(summary.app_id.as_deref(), Some("123456"));
        assert!(summary.client_secret_configured);
        assert_eq!(summary.dm_policy, "allowlist");
        assert_eq!(summary.allow_from, vec!["USER_A"]);
        assert_eq!(summary.group_policy, "allowlist");
        assert_eq!(summary.group_allow_from, vec!["GROUP_A"]);
        assert!(!summary.default_require_mention);
        assert_eq!(summary.transport, "webhook");
    }

    #[test]
    fn channel_setup_writes_plugin_entry_and_official_channel_config_separately() {
        let mut config = json!({
            "channels": {
                "openclaw-qqbot": {
                    "appId": "legacy"
                }
            }
        });

        apply_qqbot_channel_setup_to_config(
            &mut config,
            &QqbotChannelSetupInput {
                config_path: "unused.json".to_string(),
                enabled: true,
                app_id: Some("123456".to_string()),
                client_secret: Some("secret".to_string()),
                dm_policy: Some("open".to_string()),
                allow_from: Vec::new(),
                group_policy: Some("allowlist".to_string()),
                group_allow_from: vec!["GROUP_A".to_string()],
                default_require_mention: false,
                transport: Some("websocket".to_string()),
            },
        );

        assert_eq!(
            bool_at_path(
                &config,
                &["plugins", "entries", "openclaw-qqbot", "enabled"]
            ),
            Some(true)
        );
        assert_eq!(
            string_at_path(&config, &["channels", "qqbot", "appId"]).as_deref(),
            Some("123456")
        );
        assert!(value_at_path(&config, &["channels", "openclaw-qqbot"]).is_none());
    }
}
