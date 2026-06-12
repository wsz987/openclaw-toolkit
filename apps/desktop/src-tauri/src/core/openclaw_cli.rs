use std::{
    path::{Path, PathBuf},
    process::Output,
};

use anyhow::Context;
use serde::Deserialize;

use crate::core::{
    background_process::{
        background_command, process_friendly_path, process_friendly_path_string,
        render_command_output,
    },
    manifest::models::InstalledPlugin,
    node_runtime::node_runtime_executable,
};

#[derive(Debug, Clone)]
pub struct OpenClawCliContext {
    pub openclaw_dir: PathBuf,
    pub config_path: PathBuf,
    pub node_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct PluginsListResponse {
    #[serde(default)]
    plugins: Vec<PluginsListItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginsListItem {
    id: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    enabled: bool,
}

#[derive(Debug, Clone)]
pub struct OpenClawPluginDiscovery {
    pub installed_plugins: Vec<InstalledPlugin>,
    pub enabled_plugin_ids: Vec<String>,
}

pub fn read_plugin_discovery(context: &OpenClawCliContext) -> anyhow::Result<OpenClawPluginDiscovery> {
    let output = run_openclaw_cli(context, &["plugins", "list", "--json"])?;
    let parsed: PluginsListResponse = serde_json::from_slice(&output.stdout)
        .context("解析 openclaw plugins list --json 输出失败")?;

    let mut installed_plugins = parsed
        .plugins
        .iter()
        .map(|plugin| InstalledPlugin {
            id: plugin.id.clone(),
            version: plugin.version.clone().unwrap_or_default(),
            package: plugin.name.clone(),
        })
        .collect::<Vec<_>>();
    installed_plugins.sort_by(|left, right| left.id.cmp(&right.id));

    let mut enabled_plugin_ids = parsed
        .plugins
        .into_iter()
        .filter(|plugin| plugin.enabled)
        .map(|plugin| plugin.id)
        .collect::<Vec<_>>();
    enabled_plugin_ids.sort();

    Ok(OpenClawPluginDiscovery {
        installed_plugins,
        enabled_plugin_ids,
    })
}

pub fn list_installed_plugins(context: &OpenClawCliContext) -> anyhow::Result<Vec<InstalledPlugin>> {
    Ok(read_plugin_discovery(context)?.installed_plugins)
}

pub fn install_plugin_from_npm_pack(
    context: &OpenClawCliContext,
    artifact_path: &Path,
) -> anyhow::Result<()> {
    let install_spec = build_npm_pack_install_spec(artifact_path);
    run_openclaw_cli(
        context,
        &["plugins", "install", install_spec.as_str(), "--force"],
    )?;
    Ok(())
}

pub fn inspect_plugin(context: &OpenClawCliContext, plugin_id: &str) -> anyhow::Result<()> {
    run_openclaw_cli(context, &["plugins", "inspect", plugin_id, "--json"])?;
    Ok(())
}

pub fn uninstall_plugin(context: &OpenClawCliContext, plugin_id: &str) -> anyhow::Result<()> {
    run_openclaw_cli(context, &["plugins", "uninstall", plugin_id, "--force"])?;
    Ok(())
}

pub fn refresh_plugin_registry(context: &OpenClawCliContext) -> anyhow::Result<()> {
    run_openclaw_cli(context, &["plugins", "registry", "--refresh"])?;
    Ok(())
}

fn build_npm_pack_install_spec(artifact_path: &Path) -> String {
    format!("npm-pack:{}", process_friendly_path_string(artifact_path))
}

fn run_openclaw_cli(context: &OpenClawCliContext, args: &[&str]) -> anyhow::Result<Output> {
    let node_exe = node_runtime_executable(&context.node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let openclaw_entry = context.openclaw_dir.join("package").join("openclaw.mjs");
    if !openclaw_entry.exists() {
        anyhow::bail!("openclaw.mjs not found: {}", openclaw_entry.display());
    }

    let output = background_command(process_friendly_path(&node_exe))
        .arg(process_friendly_path(&openclaw_entry))
        .args(args)
        .env("OPENCLAW_HOME", &context.openclaw_dir)
        .env("OPENCLAW_STATE_DIR", &context.openclaw_dir)
        .env("OPENCLAW_CONFIG_PATH", &context.config_path)
        .current_dir(process_friendly_path(&context.openclaw_dir))
        .output()
        .with_context(|| format!("执行 openclaw CLI 失败: {}", args.join(" ")))?;

    if !output.status.success() {
        eprintln!(
            "[OpenClaw CLI] 执行失败: args=`{}` status={}{}",
            args.join(" "),
            output.status,
            render_command_output(&output)
        );
        anyhow::bail!("OpenClaw CLI 执行失败，请查看控制台日志。");
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::build_npm_pack_install_spec;

    #[cfg(target_os = "windows")]
    #[test]
    fn npm_pack_spec_strips_windows_verbatim_prefix() {
        assert_eq!(
            build_npm_pack_install_spec(Path::new(r"\\?\D:\workspace\artifact.tgz")),
            r"npm-pack:D:\workspace\artifact.tgz"
        );
    }

    #[test]
    fn npm_pack_spec_keeps_regular_path() {
        assert_eq!(
            build_npm_pack_install_spec(Path::new(r"D:\workspace\artifact.tgz")),
            r"npm-pack:D:\workspace\artifact.tgz"
        );
    }
}
