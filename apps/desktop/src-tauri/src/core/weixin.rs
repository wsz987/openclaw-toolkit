use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::core::{
    openclaw_cli::{read_plugin_discovery, OpenClawCliContext},
    openclaw_config::{ensure_plugins_allowlist_entry, OpenClawStatusSummary},
};

const WEIXIN_PLUGIN_ID: &str = "wechat";
const WEIXIN_PLUGIN_PACKAGE: &str = "@tencent-weixin/openclaw-weixin";
const WEIXIN_PLUGIN_ENTRY_ID: &str = "openclaw-weixin";
const WEIXIN_DEFAULT_BASE_URL: &str = "https://ilinkai.weixin.qq.com";
const WEIXIN_DEFAULT_CDN_BASE_URL: &str = "https://novac2c.cdn.weixin.qq.com/c2c";
const WEIXIN_DEFAULT_BOT_TYPE: &str = "3";
const WEIXIN_ACTIVE_LOGIN_TTL_MS: u64 = 5 * 60_000;
/// Display-only countdown for the QR code (seconds). The real expiry is
/// driven by the server returning `status == "expired"` (≈2–3 min); this
/// value just keeps the UI countdown roughly in sync with that instead of
/// showing the misleading 5-minute session TTL. Session freshness still
/// uses `WEIXIN_ACTIVE_LOGIN_TTL_MS`.
const WEIXIN_QR_DISPLAY_TTL_SECS: u64 = 180;
const WEIXIN_DEFAULT_WAIT_TIMEOUT_MS: u64 = 480_000;
const WEIXIN_QR_LONG_POLL_TIMEOUT_MS: u64 = 35_000;
static WEIXIN_LOGIN_SESSIONS: OnceLock<Mutex<HashMap<String, ActiveWeixinLogin>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WeixinChannelSummary {
    pub installed: bool,
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
    #[serde(default)]
    pub configured_account_ids: Vec<String>,
    pub base_url: String,
    pub cdn_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginStatus {
    pub installed: bool,
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
    pub configured_account_ids: Vec<String>,
    pub default_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginQrStartInput {
    pub config_path: String,
    pub account_id: Option<String>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginQrStartResult {
    pub session_key: String,
    pub qr_data_url: Option<String>,
    pub message: String,
    pub expires_in: u64,
    pub requires_verify_code: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginQrWaitInput {
    pub config_path: String,
    pub session_key: String,
    pub verify_code: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginQrWaitResult {
    pub connected: bool,
    #[serde(default)]
    pub already_connected: bool,
    #[serde(default)]
    pub needs_verify_code: bool,
    #[serde(default)]
    pub verify_code_blocked: bool,
    #[serde(default)]
    pub expired: bool,
    pub message: String,
    pub qr_data_url: Option<String>,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinChannelToggleInput {
    pub config_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinChannelToggleResult {
    pub config_path: String,
    pub enabled: bool,
    pub configured: bool,
    pub account_id: String,
}

#[derive(Debug, Clone)]
struct ActiveWeixinLogin {
    qrcode: String,
    qrcode_url: String,
    started_at: Instant,
    current_api_base_url: String,
    status: String,
    pending_verify_code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WeixinQrCodeResponse {
    qrcode: String,
    qrcode_img_content: String,
}

#[derive(Debug, Deserialize)]
struct WeixinStatusResponse {
    status: String,
    bot_token: Option<String>,
    ilink_bot_id: Option<String>,
    baseurl: Option<String>,
    ilink_user_id: Option<String>,
    redirect_host: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WeixinAccountData {
    token: Option<String>,
    saved_at: Option<String>,
    base_url: Option<String>,
    user_id: Option<String>,
}

pub fn inspect_weixin_login_status(config_path: &Path) -> anyhow::Result<WeixinLoginStatus> {
    let summary = inspect_weixin_channel_summary(config_path)?;
    Ok(WeixinLoginStatus {
        installed: summary.installed,
        enabled: summary.enabled,
        configured: summary.configured,
        account_id: summary.account_id,
        configured_account_ids: summary.configured_account_ids,
        default_base_url: WEIXIN_DEFAULT_BASE_URL.to_string(),
    })
}

pub fn inspect_weixin_channel_summary(config_path: &Path) -> anyhow::Result<WeixinChannelSummary> {
    let cli_context = openclaw_cli_context(config_path)?;
    let discovery =
        read_plugin_discovery(&cli_context).unwrap_or(crate::core::openclaw_cli::OpenClawPluginDiscovery {
            installed_plugins: Vec::new(),
            enabled_plugin_ids: Vec::new(),
        });
    let config = read_openclaw_config_value(config_path)?;
    Ok(read_weixin_channel_summary(&config, Some(&discovery), config_path))
}

pub fn apply_weixin_channel_toggle(
    input: &WeixinChannelToggleInput,
) -> anyhow::Result<WeixinChannelToggleResult> {
    let config_path = PathBuf::from(&input.config_path);
    if input.enabled {
        let _ = ensure_plugins_allowlist_entry(&config_path, WEIXIN_PLUGIN_ENTRY_ID)?;
    }
    let mut config = read_openclaw_config_value(&config_path)?;

    set_value_at_path(
        &mut config,
        &["plugins", "entries", WEIXIN_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(input.enabled),
    );
    set_value_at_path(
        &mut config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "channelConfigUpdatedAt"],
        Value::String(chrono::Utc::now().to_rfc3339()),
    );

    if value_at_path(&config, &["channels", WEIXIN_PLUGIN_ENTRY_ID, "defaultAccount"]).is_none() {
        let fallback_account_id = configured_weixin_account_ids(&config_path)?
            .into_iter()
            .next()
            .unwrap_or_else(|| "default".to_string());
        set_value_at_path(
            &mut config,
            &["channels", WEIXIN_PLUGIN_ENTRY_ID, "defaultAccount"],
            Value::String(fallback_account_id),
        );
    }

    write_config_value(&config_path, &config)?;
    let summary = inspect_weixin_channel_summary(&config_path)?;
    Ok(WeixinChannelToggleResult {
        config_path: input.config_path.clone(),
        enabled: summary.enabled,
        configured: summary.configured,
        account_id: summary.account_id,
    })
}

pub fn start_weixin_login_with_qr(
    input: &WeixinLoginQrStartInput,
) -> anyhow::Result<WeixinLoginQrStartResult> {
    let config_path = PathBuf::from(&input.config_path);
    let session_key = normalize_account_id(input.account_id.as_deref());
    purge_expired_sessions();

    if !input.force {
        if let Some(existing) = login_sessions()
            .lock()
            .map_err(|_| anyhow::anyhow!("微信登录会话状态异常"))?
            .get(&session_key)
            .cloned()
        {
            if is_login_fresh(&existing) {
                return Ok(WeixinLoginQrStartResult {
                    session_key,
                    qr_data_url: Some(existing.qrcode_url.clone()),
                    message: "二维码已生成，请继续使用手机微信扫码。".to_string(),
                    expires_in: remaining_expires_in(&existing),
                    requires_verify_code: existing.status == "need_verifycode",
                });
            }
        }
    }

    let qrcode = fetch_weixin_qrcode(&config_path, WEIXIN_DEFAULT_BOT_TYPE)?;
    let active = ActiveWeixinLogin {
        qrcode: qrcode.qrcode,
        qrcode_url: qrcode.qrcode_img_content.clone(),
        started_at: Instant::now(),
        current_api_base_url: WEIXIN_DEFAULT_BASE_URL.to_string(),
        status: "wait".to_string(),
        pending_verify_code: None,
    };

    login_sessions()
        .lock()
        .map_err(|_| anyhow::anyhow!("微信登录会话状态异常"))?
        .insert(session_key.clone(), active);

    Ok(WeixinLoginQrStartResult {
        session_key,
        qr_data_url: Some(qrcode.qrcode_img_content),
        message: "请使用手机微信扫描二维码以继续连接。".to_string(),
        expires_in: WEIXIN_QR_DISPLAY_TTL_SECS,
        requires_verify_code: false,
    })
}

pub fn wait_for_weixin_login(
    input: &WeixinLoginQrWaitInput,
) -> anyhow::Result<WeixinLoginQrWaitResult> {
    let config_path = PathBuf::from(&input.config_path);
    let timeout_ms = input
        .timeout_ms
        .unwrap_or(WEIXIN_DEFAULT_WAIT_TIMEOUT_MS)
        .max(1_000);
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let verify_code = input
        .verify_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let session_key = input.session_key.trim().to_string();

    loop {
        let outcome = step_weixin_login_poll(&config_path, &session_key, verify_code.clone())?;
        if outcome.connected
            || outcome.already_connected
            || outcome.needs_verify_code
            || outcome.verify_code_blocked
            || outcome.expired
        {
            return Ok(outcome);
        }

        if Instant::now() >= deadline {
            remove_login_session(&session_key);
            return Ok(WeixinLoginQrWaitResult {
                connected: false,
                already_connected: false,
                needs_verify_code: false,
                verify_code_blocked: false,
                expired: false,
                message: "登录超时，请重试。".to_string(),
                qr_data_url: None,
                expires_in: None,
            });
        }

        thread::sleep(Duration::from_secs(1));
    }
}

pub fn apply_weixin_status_to_summary(
    status: &mut OpenClawStatusSummary,
    config_path: &Path,
) -> anyhow::Result<()> {
    status.weixin_channel = inspect_weixin_channel_summary(config_path)?;
    Ok(())
}

pub fn read_weixin_channel_summary(
    config: &Value,
    discovery: Option<&crate::core::openclaw_cli::OpenClawPluginDiscovery>,
    config_path: &Path,
) -> WeixinChannelSummary {
    let configured_account_ids = configured_weixin_account_ids(config_path).unwrap_or_default();
    let account_id = string_at_path(config, &["channels", WEIXIN_PLUGIN_ENTRY_ID, "defaultAccount"])
        .or_else(|| configured_account_ids.first().cloned())
        .unwrap_or_else(|| "default".to_string());
    let account_entry = value_at_path(
        config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id.as_str()],
    );
    let state_account = load_weixin_account(config_path, &account_id)
        .ok()
        .flatten()
        .unwrap_or_default();

    let installed = discovery
        .map(|entries| {
            entries.installed_plugins.iter().any(|plugin| {
                plugin.id.eq_ignore_ascii_case(WEIXIN_PLUGIN_ENTRY_ID)
                    || plugin.id.eq_ignore_ascii_case(WEIXIN_PLUGIN_ID)
                    || plugin
                        .package
                        .as_deref()
                        .map(|package| package.eq_ignore_ascii_case(WEIXIN_PLUGIN_PACKAGE))
                        .unwrap_or(false)
            })
        })
        .unwrap_or_else(|| {
            bool_at_path(config, &["plugins", "entries", WEIXIN_PLUGIN_ENTRY_ID, "enabled"])
                .unwrap_or(false)
        });
    let enabled = discovery
        .map(|entries| {
            entries.enabled_plugin_ids.iter().any(|plugin_id| {
                plugin_id.eq_ignore_ascii_case(WEIXIN_PLUGIN_ENTRY_ID)
                    || plugin_id.eq_ignore_ascii_case(WEIXIN_PLUGIN_ID)
            })
        })
        .unwrap_or(false)
        || bool_at_path(config, &["plugins", "entries", WEIXIN_PLUGIN_ENTRY_ID, "enabled"])
            .unwrap_or(false)
        || bool_at_path(config, &["channels", WEIXIN_PLUGIN_ENTRY_ID, "enabled"]).unwrap_or(false);

    let configured = !configured_account_ids.is_empty();
    WeixinChannelSummary {
        installed,
        enabled,
        configured,
        account_id,
        configured_account_ids,
        base_url: state_account
            .base_url
            .or_else(|| {
                account_entry
                    .and_then(|entry| entry.get("baseUrl"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
            .unwrap_or_else(|| WEIXIN_DEFAULT_BASE_URL.to_string()),
        cdn_base_url: account_entry
            .and_then(|entry| entry.get("cdnBaseUrl"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| WEIXIN_DEFAULT_CDN_BASE_URL.to_string()),
    }
}

fn step_weixin_login_poll(
    config_path: &Path,
    session_key: &str,
    verify_code: Option<String>,
) -> anyhow::Result<WeixinLoginQrWaitResult> {
    let mut sessions = login_sessions()
        .lock()
        .map_err(|_| anyhow::anyhow!("微信登录会话状态异常"))?;
    let Some(active) = sessions.get_mut(session_key) else {
        return Ok(WeixinLoginQrWaitResult {
            connected: false,
            already_connected: false,
            needs_verify_code: false,
            verify_code_blocked: false,
            expired: true,
            message: "当前没有进行中的微信登录会话，请重新生成二维码。".to_string(),
            qr_data_url: None,
            expires_in: None,
        });
    };

    if !is_login_fresh(active) {
        sessions.remove(session_key);
        return Ok(expired_result("二维码已失效，请重新生成。"));
    }

    if let Some(code) = verify_code {
        active.pending_verify_code = Some(code);
    }

    let pending_verify_code = active.pending_verify_code.clone();
    let response = poll_weixin_qrcode_status(
        &active.current_api_base_url,
        &active.qrcode,
        pending_verify_code.as_deref(),
    )?;
    active.status = response.status.clone();

    match response.status.as_str() {
        "wait" => Ok(progress_result(
            active,
            "等待扫码中。",
            false,
            false,
            false,
        )),
        "scaned" => {
            if pending_verify_code.is_some() {
                active.pending_verify_code = None;
                return Ok(progress_result(
                    active,
                    "验证码已确认，请继续在手机端完成授权。",
                    false,
                    false,
                    false,
                ));
            }

            Ok(progress_result(
                active,
                "已扫码，正在等待手机端确认。",
                false,
                false,
                false,
            ))
        }
        "need_verifycode" => {
            active.pending_verify_code = None;
            Ok(WeixinLoginQrWaitResult {
                connected: false,
                already_connected: false,
                needs_verify_code: true,
                verify_code_blocked: false,
                expired: false,
                message: if pending_verify_code.is_some() {
                    "验证码不匹配，请重新输入手机微信上显示的数字。".to_string()
                } else {
                    "请输入手机微信上显示的数字验证码。".to_string()
                },
                qr_data_url: Some(active.qrcode_url.clone()),
                expires_in: Some(remaining_expires_in(active)),
            })
        }
        "verify_code_blocked" => {
            sessions.remove(session_key);
            Ok(WeixinLoginQrWaitResult {
                connected: false,
                already_connected: false,
                needs_verify_code: false,
                verify_code_blocked: true,
                expired: false,
                message: "多次验证码输入错误，请重新生成二维码。".to_string(),
                qr_data_url: None,
                expires_in: None,
            })
        }
        "expired" => {
            sessions.remove(session_key);
            Ok(expired_result("二维码已过期，请重新生成。"))
        }
        "scaned_but_redirect" => {
            if let Some(redirect_host) = response.redirect_host.as_deref() {
                active.current_api_base_url = format!("https://{redirect_host}");
            }
            Ok(progress_result(
                active,
                "扫码状态已更新，正在切换微信接入节点。",
                false,
                false,
                false,
            ))
        }
        "binded_redirect" => {
            sessions.remove(session_key);
            Ok(WeixinLoginQrWaitResult {
                connected: false,
                already_connected: true,
                needs_verify_code: false,
                verify_code_blocked: false,
                expired: false,
                message: "该微信账号已经绑定到当前 OpenClaw，无需重复登录。".to_string(),
                qr_data_url: None,
                expires_in: None,
            })
        }
        "confirmed" => {
            let raw_account_id = response
                .ilink_bot_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .context("微信登录成功但未返回 ilink_bot_id")?;
            let normalized_account_id = normalize_account_id(Some(raw_account_id));
            save_weixin_account(
                config_path,
                &normalized_account_id,
                WeixinAccountData {
                    token: response.bot_token.clone(),
                    saved_at: Some(chrono::Utc::now().to_rfc3339()),
                    base_url: response
                        .baseurl
                        .clone()
                        .or_else(|| Some(WEIXIN_DEFAULT_BASE_URL.to_string())),
                    user_id: response.ilink_user_id.clone(),
                },
            )?;
            register_weixin_account_id(config_path, &normalized_account_id)?;
            clear_stale_accounts_for_user_id(
                config_path,
                &normalized_account_id,
                response.ilink_user_id.as_deref(),
            )?;
            ensure_weixin_channel_enabled(config_path, &normalized_account_id)?;
            sessions.remove(session_key);

            Ok(WeixinLoginQrWaitResult {
                connected: true,
                already_connected: false,
                needs_verify_code: false,
                verify_code_blocked: false,
                expired: false,
                message: "已将此 OpenClaw 连接到微信。".to_string(),
                qr_data_url: None,
                expires_in: None,
            })
        }
        other => Ok(progress_result(
            active,
            &format!("微信登录状态更新：{other}"),
            false,
            false,
            false,
        )),
    }
}

fn progress_result(
    active: &ActiveWeixinLogin,
    message: &str,
    needs_verify_code: bool,
    verify_code_blocked: bool,
    expired: bool,
) -> WeixinLoginQrWaitResult {
    WeixinLoginQrWaitResult {
        connected: false,
        already_connected: false,
        needs_verify_code,
        verify_code_blocked,
        expired,
        message: message.to_string(),
        qr_data_url: Some(active.qrcode_url.clone()),
        expires_in: Some(remaining_expires_in(active)),
    }
}

fn expired_result(message: &str) -> WeixinLoginQrWaitResult {
    WeixinLoginQrWaitResult {
        connected: false,
        already_connected: false,
        needs_verify_code: false,
        verify_code_blocked: false,
        expired: true,
        message: message.to_string(),
        qr_data_url: None,
        expires_in: None,
    }
}

fn fetch_weixin_qrcode(
    config_path: &Path,
    bot_type: &str,
) -> anyhow::Result<WeixinQrCodeResponse> {
    let local_token_list = local_weixin_tokens(config_path)?;
    let client = reqwest_client()?;
    let response = client
        .post(format!(
            "{WEIXIN_DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type={bot_type}"
        ))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(json!({ "local_token_list": local_token_list }).to_string())
        .send()
        .context("request Weixin QR code")?;

    let status = response.status();
    let body = response
        .text()
        .with_context(|| format!("read Weixin QR code response: HTTP {status}"))?;

    if !status.is_success() {
        anyhow::bail!("获取微信二维码失败: HTTP {} {}", status.as_u16(), body);
    }

    serde_json::from_str::<WeixinQrCodeResponse>(&body)
        .with_context(|| format!("parse Weixin QR code response: HTTP {status} body: {body}"))
}

fn poll_weixin_qrcode_status(
    api_base_url: &str,
    qrcode: &str,
    verify_code: Option<&str>,
) -> anyhow::Result<WeixinStatusResponse> {
    let mut url = format!("{api_base_url}/ilink/bot/get_qrcode_status?qrcode={qrcode}");
    if let Some(verify_code) = verify_code {
        url.push_str("&verify_code=");
        url.push_str(verify_code);
    }

    let client = reqwest_client()?;
    match client
        .get(url)
        .timeout(Duration::from_millis(WEIXIN_QR_LONG_POLL_TIMEOUT_MS))
        .send()
    {
        Ok(response) => {
            let status = response.status();
            let body = response
                .text()
                .with_context(|| format!("read Weixin QR status response: HTTP {status}"))?;
            if !status.is_success() {
                eprintln!(
                    "[Weixin 登录] QR 轮询返回非成功状态，按 wait 继续处理: HTTP {} {}",
                    status.as_u16(),
                    body
                );
                return Ok(wait_status_response());
            }

            serde_json::from_str::<WeixinStatusResponse>(&body).with_context(|| {
                format!("parse Weixin QR status response: HTTP {status} body: {body}")
            })
        }
        Err(error) if error.is_timeout() => Ok(wait_status_response()),
        Err(error) => {
            eprintln!("[Weixin 登录] QR 轮询异常，按 wait 继续处理: {error}");
            Ok(wait_status_response())
        }
    }
}

fn wait_status_response() -> WeixinStatusResponse {
    WeixinStatusResponse {
        status: "wait".to_string(),
        bot_token: None,
        ilink_bot_id: None,
        baseurl: None,
        ilink_user_id: None,
        redirect_host: None,
    }
}

fn local_weixin_tokens(config_path: &Path) -> anyhow::Result<Vec<String>> {
    let account_ids = list_indexed_weixin_account_ids(config_path)?;
    Ok(account_ids
        .into_iter()
        .rev()
        .filter_map(|account_id| {
            load_weixin_account(config_path, &account_id)
                .ok()
                .flatten()
                .and_then(|entry| entry.token)
                .map(|token| token.trim().to_string())
                .filter(|token| !token.is_empty())
        })
        .take(10)
        .collect())
}

fn configured_weixin_account_ids(config_path: &Path) -> anyhow::Result<Vec<String>> {
    let account_ids = list_indexed_weixin_account_ids(config_path)?;
    Ok(account_ids
        .into_iter()
        .filter(|account_id| {
            load_weixin_account(config_path, account_id)
                .ok()
                .flatten()
                .and_then(|entry| entry.token)
                .map(|token| !token.trim().is_empty())
                .unwrap_or(false)
        })
        .collect())
}

fn save_weixin_account(
    config_path: &Path,
    account_id: &str,
    data: WeixinAccountData,
) -> anyhow::Result<()> {
    let path = resolve_weixin_accounts_dir(config_path).join(format!("{account_id}.json"));
    fs::create_dir_all(
        path.parent()
            .with_context(|| format!("resolve weixin account dir for {}", path.display()))?,
    )?;
    fs::write(&path, serde_json::to_string_pretty(&data)?)
        .with_context(|| format!("write weixin account {}", path.display()))?;
    Ok(())
}

fn load_weixin_account(
    config_path: &Path,
    account_id: &str,
) -> anyhow::Result<Option<WeixinAccountData>> {
    let path = resolve_weixin_accounts_dir(config_path).join(format!("{account_id}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("read weixin account {}", path.display()))?;
    Ok(Some(
        serde_json::from_str(&raw)
            .with_context(|| format!("parse weixin account {}", path.display()))?,
    ))
}

fn clear_stale_accounts_for_user_id(
    config_path: &Path,
    current_account_id: &str,
    user_id: Option<&str>,
) -> anyhow::Result<()> {
    let user_id = user_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let Some(user_id) = user_id else {
        return Ok(());
    };

    let mut account_ids = list_indexed_weixin_account_ids(config_path)?;
    let mut changed = false;
    for account_id in account_ids.clone() {
        if account_id == current_account_id {
            continue;
        }
        let Some(account) = load_weixin_account(config_path, &account_id)? else {
            continue;
        };
        if account.user_id.as_deref().map(str::trim) == Some(user_id.as_str()) {
            let account_path = resolve_weixin_accounts_dir(config_path).join(format!("{account_id}.json"));
            let _ = fs::remove_file(account_path);
            account_ids.retain(|entry| entry != &account_id);
            changed = true;
        }
    }

    if changed {
        fs::create_dir_all(resolve_weixin_state_dir(config_path))?;
        fs::write(
            resolve_weixin_account_index_path(config_path),
            serde_json::to_string_pretty(&account_ids)?,
        )
        .with_context(|| "write weixin accounts index".to_string())?;
    }

    Ok(())
}

fn register_weixin_account_id(config_path: &Path, account_id: &str) -> anyhow::Result<()> {
    let mut ids = list_indexed_weixin_account_ids(config_path)?;
    if !ids.iter().any(|existing| existing.eq_ignore_ascii_case(account_id)) {
        ids.push(account_id.to_string());
        fs::create_dir_all(resolve_weixin_state_dir(config_path))?;
        fs::write(
            resolve_weixin_account_index_path(config_path),
            serde_json::to_string_pretty(&ids)?,
        )
        .with_context(|| "write weixin accounts index".to_string())?;
    }
    Ok(())
}

fn list_indexed_weixin_account_ids(config_path: &Path) -> anyhow::Result<Vec<String>> {
    let path = resolve_weixin_account_index_path(config_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("read weixin account index {}", path.display()))?;
    let values: Vec<String> = serde_json::from_str(&raw)
        .with_context(|| format!("parse weixin account index {}", path.display()))?;
    Ok(values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect())
}

fn ensure_weixin_channel_enabled(config_path: &Path, account_id: &str) -> anyhow::Result<()> {
    let _ = ensure_plugins_allowlist_entry(config_path, WEIXIN_PLUGIN_ENTRY_ID)?;
    let mut config = read_openclaw_config_value(config_path)?;
    set_value_at_path(
        &mut config,
        &["plugins", "entries", WEIXIN_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(true),
    );
    set_value_at_path(
        &mut config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "enabled"],
        Value::Bool(true),
    );
    set_value_at_path(
        &mut config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "defaultAccount"],
        Value::String(account_id.to_string()),
    );
    set_value_at_path(
        &mut config,
        &["channels", WEIXIN_PLUGIN_ENTRY_ID, "channelConfigUpdatedAt"],
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
    if value_at_path(&config, &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id]).is_none()
    {
        set_value_at_path(
            &mut config,
            &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id],
            json!({
                "enabled": true,
                "cdnBaseUrl": WEIXIN_DEFAULT_CDN_BASE_URL,
            }),
        );
    } else {
        set_value_at_path(
            &mut config,
            &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id, "enabled"],
            Value::Bool(true),
        );
        if value_at_path(
            &config,
            &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id, "cdnBaseUrl"],
        )
        .is_none()
        {
            set_value_at_path(
                &mut config,
                &["channels", WEIXIN_PLUGIN_ENTRY_ID, "accounts", account_id, "cdnBaseUrl"],
                Value::String(WEIXIN_DEFAULT_CDN_BASE_URL.to_string()),
            );
        }
    }
    write_config_value(config_path, &config)
}

fn resolve_weixin_state_dir(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .unwrap_or(config_path)
        .join("openclaw-weixin")
}

fn resolve_weixin_account_index_path(config_path: &Path) -> PathBuf {
    resolve_weixin_state_dir(config_path).join("accounts.json")
}

fn resolve_weixin_accounts_dir(config_path: &Path) -> PathBuf {
    resolve_weixin_state_dir(config_path).join("accounts")
}

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

fn login_sessions() -> &'static Mutex<HashMap<String, ActiveWeixinLogin>> {
    WEIXIN_LOGIN_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
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

fn is_login_fresh(login: &ActiveWeixinLogin) -> bool {
    login.started_at.elapsed() < Duration::from_millis(WEIXIN_ACTIVE_LOGIN_TTL_MS)
}

fn remaining_expires_in(login: &ActiveWeixinLogin) -> u64 {
    Duration::from_secs(WEIXIN_QR_DISPLAY_TTL_SECS)
        .saturating_sub(login.started_at.elapsed())
        .as_secs()
        .max(1)
}

fn reqwest_client() -> anyhow::Result<Client> {
    Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_millis(WEIXIN_QR_LONG_POLL_TIMEOUT_MS))
        .build()
        .context("build Weixin HTTP client")
}

fn normalize_account_id(value: Option<&str>) -> String {
    let trimmed = value.unwrap_or_default().trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        return "default".to_string();
    }

    let mut normalized = trimmed
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if normalized.is_empty() {
        normalized = "default".to_string();
    }

    normalized.chars().take(96).collect()
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
