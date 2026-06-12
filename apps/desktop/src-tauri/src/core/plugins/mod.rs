use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    thread,
};

use anyhow::Context;
use semver::{Version, VersionReq};

use crate::core::{
    background_process::{background_command, process_friendly_path},
    manifest::{
        load_plugin_manifest,
        models::{InstalledManifest, InstalledPlugin, PluginArtifact, PluginInstallCommand},
    },
    node_runtime::{
        node_runtime_executable, node_runtime_npm_command, node_runtime_npx_command,
        parse_node_version,
    },
    openclaw_cli::{
        OpenClawCliContext, inspect_plugin, list_installed_plugins, refresh_plugin_registry,
        uninstall_plugin,
    },
    openclaw_config::apply_managed_node_command_env,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallInput {
    pub config_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallResult {
    pub config_path: String,
    pub plugin_id: String,
    pub plugin_entry_id: String,
    pub package: String,
    pub version: String,
    pub install_type: String,
    pub install_command_summary: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallInput {
    pub config_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallResult {
    pub config_path: String,
    pub plugin_id: String,
    pub plugin_entry_id: String,
    pub package: String,
    pub uninstall_command_summary: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallProgress {
    pub stage: String,
    pub progress: u8,
    pub message: String,
    pub done: bool,
    pub failed: bool,
}

pub fn install_plugin_from_manifest(
    config_path: &Path,
    requested_plugin_id: &str,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<PluginInstallResult> {
    emit_plugin_install_progress(
        progress_callback,
        "resolving",
        8,
        &format!("正在解析通道插件清单：{requested_plugin_id}"),
        false,
        false,
    );
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
    let installed_manifest = read_installed_manifest(&installed_manifest_path)?;
    let project_root = resolve_resource_root_from_openclaw_dir(openclaw_dir)?;
    let plugin_manifest = load_plugin_manifest(&project_root)?;
    let plugin = resolve_plugin(&plugin_manifest.plugins, requested_plugin_id)?;

    emit_plugin_install_progress(
        progress_callback,
        "validating",
        18,
        &format!("正在校验插件 {} 的版本兼容性...", plugin.id),
        false,
        false,
    );
    validate_plugin_compatibility(plugin, &installed_manifest)?;

    let package_dir = openclaw_dir.join("package");
    if !package_dir.exists() {
        anyhow::bail!("OpenClaw package 目录不存在：{}", package_dir.display());
    }
    let cli_context = OpenClawCliContext {
        openclaw_dir: openclaw_dir.to_path_buf(),
        config_path: config_path.to_path_buf(),
        node_dir: PathBuf::from(&installed_manifest.node_dir),
    };

    let install_command = plugin.install_command.as_ref().with_context(|| {
        format!(
            "插件 {} 未配置官方安装命令，请检查 artifacts/plugins.json",
            plugin.id
        )
    })?;
    let install_type = plugin
        .install_type
        .clone()
        .unwrap_or_else(|| "official-command".to_string());

    emit_plugin_install_progress(
        progress_callback,
        "installing",
        52,
        &format!("正在通过官方链路安装插件包 {} ...", plugin.package),
        false,
        false,
    );
    execute_install_command(
        &cli_context,
        &package_dir,
        &installed_manifest,
        plugin,
        install_command,
        progress_callback,
    )?;

    emit_plugin_install_progress(
        progress_callback,
        "recording",
        88,
        "正在核验 OpenClaw 插件注册状态...",
        false,
        false,
    );
    inspect_plugin(&cli_context, &plugin.plugin_entry_id)
        .or_else(|_| inspect_plugin(&cli_context, &plugin.id))
        .with_context(|| format!("OpenClaw 未发现刚安装的插件 {}", plugin.plugin_entry_id))?;
    let _ = refresh_plugin_registry(&cli_context);
    let discovered_plugins = list_installed_plugins(&cli_context)?;
    update_installed_manifest(
        &installed_manifest_path,
        &installed_manifest,
        plugin,
        &discovered_plugins,
    )?;
    emit_plugin_install_progress(
        progress_callback,
        "ready",
        100,
        &format!("插件 {} 安装完成。", plugin.id),
        true,
        false,
    );

    Ok(PluginInstallResult {
        config_path: config_path.to_string_lossy().to_string(),
        plugin_id: plugin.id.clone(),
        plugin_entry_id: plugin.plugin_entry_id.clone(),
        package: plugin.package.clone(),
        version: plugin.version.clone(),
        install_type,
        install_command_summary: summarize_resolved_install_command(plugin, install_command),
    })
}

pub fn uninstall_plugin_from_manifest(
    config_path: &Path,
    requested_plugin_id: &str,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<PluginUninstallResult> {
    emit_plugin_install_progress(
        progress_callback,
        "resolving",
        8,
        &format!("正在解析待卸载插件：{requested_plugin_id}"),
        false,
        false,
    );
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let installed_manifest_path = openclaw_dir.join("installed-manifest.json");
    let installed_manifest = read_installed_manifest(&installed_manifest_path)?;
    let project_root = resolve_resource_root_from_openclaw_dir(openclaw_dir)?;
    let plugin_manifest = load_plugin_manifest(&project_root)?;
    let plugin = resolve_plugin(&plugin_manifest.plugins, requested_plugin_id)?;
    let cli_context = OpenClawCliContext {
        openclaw_dir: openclaw_dir.to_path_buf(),
        config_path: config_path.to_path_buf(),
        node_dir: PathBuf::from(&installed_manifest.node_dir),
    };

    emit_plugin_install_progress(
        progress_callback,
        "disabling",
        22,
        "正在清理本地配置中的插件与通道入口...",
        false,
        false,
    );
    let _ = prepare_config_for_plugin_uninstall(config_path, plugin)?;

    emit_plugin_install_progress(
        progress_callback,
        "uninstalling",
        56,
        &format!(
            "正在通过 OpenClaw 官方链路卸载插件包 {} ...",
            plugin.package
        ),
        false,
        false,
    );
    uninstall_plugin_via_official_command(&cli_context, plugin, progress_callback)?;

    emit_plugin_install_progress(
        progress_callback,
        "recording",
        88,
        "正在同步本地插件注册状态...",
        false,
        false,
    );
    let _ = refresh_plugin_registry(&cli_context);
    let discovered_plugins = list_installed_plugins(&cli_context).unwrap_or_default();
    remove_plugin_from_installed_manifest(
        &installed_manifest_path,
        &installed_manifest,
        plugin,
        &discovered_plugins,
    )?;
    emit_plugin_install_progress(
        progress_callback,
        "ready",
        100,
        &format!("插件 {} 卸载完成。", plugin.id),
        true,
        false,
    );

    Ok(PluginUninstallResult {
        config_path: config_path.to_string_lossy().to_string(),
        plugin_id: plugin.id.clone(),
        plugin_entry_id: plugin.plugin_entry_id.clone(),
        package: plugin.package.clone(),
        uninstall_command_summary: format!("openclaw plugins uninstall {}", plugin.plugin_entry_id),
    })
}

fn resolve_plugin<'a>(
    plugins: &'a [PluginArtifact],
    requested_plugin_id: &str,
) -> anyhow::Result<&'a PluginArtifact> {
    plugins
        .iter()
        .find(|plugin| {
            plugin.id.eq_ignore_ascii_case(requested_plugin_id)
                || plugin
                    .plugin_entry_id
                    .eq_ignore_ascii_case(requested_plugin_id)
                || plugin
                    .aliases
                    .iter()
                    .any(|alias| alias.eq_ignore_ascii_case(requested_plugin_id))
                || plugin
                    .channel_id
                    .as_deref()
                    .map(|channel_id| channel_id.eq_ignore_ascii_case(requested_plugin_id))
                    .unwrap_or(false)
        })
        .ok_or_else(|| anyhow::anyhow!("未找到插件安装配置：{}", requested_plugin_id))
}

fn validate_plugin_compatibility(
    plugin: &PluginArtifact,
    installed_manifest: &InstalledManifest,
) -> anyhow::Result<()> {
    if let Some(range) = plugin.openclaw_version_range.as_deref() {
        let version =
            parse_semver_like(&installed_manifest.openclaw_version).with_context(|| {
                format!(
                    "解析 OpenClaw 版本失败：{}",
                    installed_manifest.openclaw_version
                )
            })?;
        ensure_version_matches(&version, range, "OpenClaw")?;
    }

    if let Some(range) = plugin.node_version_range.as_deref() {
        let version = parse_node_version(&installed_manifest.node_version)
            .with_context(|| format!("解析 Node 版本失败：{}", installed_manifest.node_version))?;
        ensure_version_matches(&version, range, "Node")?;
    }

    Ok(())
}

fn execute_install_command(
    cli_context: &OpenClawCliContext,
    package_dir: &Path,
    installed_manifest: &InstalledManifest,
    plugin: &PluginArtifact,
    install_command: &PluginInstallCommand,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<()> {
    if install_command.uses_openclaw_cli_context {
        return execute_openclaw_cli_install_command(
            cli_context,
            plugin,
            install_command,
            progress_callback,
        );
    }

    let node_dir = PathBuf::from(&installed_manifest.node_dir);
    let node_exe = node_runtime_executable(&node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }
    let program = resolve_install_command_program(&node_dir, &node_exe, install_command)?;

    progress_callback.map(|callback| {
        callback(&PluginInstallProgress {
            stage: "installing".to_string(),
            progress: 64,
            message: "正在调用官方插件安装流程...".to_string(),
            done: false,
            failed: false,
        })
    });

    let resolved_args = resolve_install_command_args(plugin, install_command);
    eprintln!(
        "[Plugin 安装] 准备执行命令: {}",
        summarize_executable_and_args(&program.to_string_lossy(), &resolved_args)
    );
    let mut command = background_command(process_friendly_path(&program));
    command.args(&resolved_args);
    apply_managed_node_command_env(
        &mut command,
        package_dir,
        &node_exe,
        true,
        install_command.uses_managed_node_path,
        Some(Stdio::piped()),
        Some(Stdio::piped()),
    );

    for env in &install_command.env {
        command.env(&env.name, &env.value);
    }

    let mut child = command.spawn().with_context(|| {
        format!(
            "执行官方插件安装命令失败: {}",
            summarize_executable_and_args(&program.to_string_lossy(), &resolved_args)
        )
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let detail_lines = Arc::new(Mutex::new(Vec::<String>::new()));

    let status = thread::scope(|scope| -> anyhow::Result<std::process::ExitStatus> {
        let stdout_task = stdout.map(|stream| {
            let detail_lines = Arc::clone(&detail_lines);
            scope.spawn(move || {
                collect_plugin_install_lines(
                    stream,
                    progress_callback,
                    false,
                    "stdout",
                    &detail_lines,
                )
            })
        });
        let stderr_task = stderr.map(|stream| {
            let detail_lines = Arc::clone(&detail_lines);
            scope.spawn(move || {
                collect_plugin_install_lines(
                    stream,
                    progress_callback,
                    true,
                    "stderr",
                    &detail_lines,
                )
            })
        });

        let status = child.wait().context("wait for plugin install command")?;

        if let Some(task) = stdout_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("plugin stdout stream thread panicked"))?;
        }

        if let Some(task) = stderr_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("plugin stderr stream thread panicked"))?;
        }

        Ok(status)
    })?;

    if !status.success() {
        let detail_lines = detail_lines
            .lock()
            .map(|lines| lines.clone())
            .unwrap_or_default();
        eprintln!(
            "[Plugin 安装] 官方插件安装命令失败，退出状态 {}{}{}",
            status,
            if detail_lines.is_empty() {
                ""
            } else {
                "\nrecent logs:\n"
            },
            detail_lines.join("\n")
        );
        anyhow::bail!("官方插件安装失败，请查看控制台日志。");
    }

    Ok(())
}

fn execute_openclaw_cli_install_command(
    cli_context: &OpenClawCliContext,
    plugin: &PluginArtifact,
    install_command: &PluginInstallCommand,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<()> {
    let node_exe = node_runtime_executable(&cli_context.node_dir);
    if !node_exe.exists() {
        anyhow::bail!("node.exe not found: {}", node_exe.display());
    }

    let openclaw_entry = cli_context
        .openclaw_dir
        .join("package")
        .join("openclaw.mjs");
    if !openclaw_entry.exists() {
        anyhow::bail!("openclaw.mjs not found: {}", openclaw_entry.display());
    }

    let resolved_args = resolve_install_command_args(plugin, install_command);
    let mut display_parts = vec![
        process_friendly_path(&node_exe)
            .to_string_lossy()
            .to_string(),
        process_friendly_path(&openclaw_entry)
            .to_string_lossy()
            .to_string(),
    ];
    display_parts.extend(resolved_args.iter().cloned());

    progress_callback.map(|callback| {
        callback(&PluginInstallProgress {
            stage: "installing".to_string(),
            progress: 64,
            message: "正在调用 OpenClaw 官方插件安装流程...".to_string(),
            done: false,
            failed: false,
        })
    });
    eprintln!("[Plugin 安装] 准备执行命令: {}", display_parts.join(" "));

    let mut command = background_command(process_friendly_path(&node_exe));
    command.arg(process_friendly_path(&openclaw_entry));
    command.args(&resolved_args);
    apply_managed_node_command_env(
        &mut command,
        &cli_context.openclaw_dir,
        &node_exe,
        true,
        true,
        Some(Stdio::piped()),
        Some(Stdio::piped()),
    );
    command
        .env("OPENCLAW_HOME", &cli_context.openclaw_dir)
        .env("OPENCLAW_STATE_DIR", &cli_context.openclaw_dir)
        .env("OPENCLAW_CONFIG_PATH", &cli_context.config_path);

    for env in &install_command.env {
        command.env(&env.name, &env.value);
    }

    let mut child = command.spawn().with_context(|| {
        format!(
            "执行 OpenClaw 官方插件安装命令失败: {}",
            display_parts.join(" ")
        )
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let detail_lines = Arc::new(Mutex::new(Vec::<String>::new()));

    let status = thread::scope(|scope| -> anyhow::Result<std::process::ExitStatus> {
        let stdout_task = stdout.map(|stream| {
            let detail_lines = Arc::clone(&detail_lines);
            scope.spawn(move || {
                collect_plugin_install_lines(
                    stream,
                    progress_callback,
                    false,
                    "stdout",
                    &detail_lines,
                )
            })
        });
        let stderr_task = stderr.map(|stream| {
            let detail_lines = Arc::clone(&detail_lines);
            scope.spawn(move || {
                collect_plugin_install_lines(
                    stream,
                    progress_callback,
                    true,
                    "stderr",
                    &detail_lines,
                )
            })
        });

        let status = child
            .wait()
            .context("wait for openclaw plugin install command")?;

        if let Some(task) = stdout_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("plugin stdout stream thread panicked"))?;
        }

        if let Some(task) = stderr_task {
            task.join()
                .map_err(|_| anyhow::anyhow!("plugin stderr stream thread panicked"))?;
        }

        Ok(status)
    })?;

    if !status.success() {
        let detail_lines = detail_lines
            .lock()
            .map(|lines| lines.clone())
            .unwrap_or_default();
        eprintln!(
            "[Plugin 安装] OpenClaw 官方插件安装命令失败，退出状态 {}{}{}",
            status,
            if detail_lines.is_empty() {
                ""
            } else {
                "\nrecent logs:\n"
            },
            detail_lines.join("\n")
        );
        anyhow::bail!("官方插件安装失败，请查看控制台日志。");
    }

    Ok(())
}

fn summarize_resolved_install_command(
    plugin: &PluginArtifact,
    install_command: &PluginInstallCommand,
) -> String {
    let args = resolve_install_command_args(plugin, install_command);
    if install_command.uses_openclaw_cli_context {
        let mut parts = vec!["openclaw".to_string()];
        parts.extend(args);
        return parts.join(" ");
    }

    summarize_executable_and_args(&install_command.executable, &args)
}

fn summarize_executable_and_args(executable: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(1 + args.len());
    parts.push(executable.to_string());
    parts.extend(args.iter().cloned());
    parts.join(" ")
}

fn resolve_install_command_args(
    plugin: &PluginArtifact,
    install_command: &PluginInstallCommand,
) -> Vec<String> {
    let package_with_version = format!("{}@{}", plugin.package, plugin.version);
    install_command
        .args
        .iter()
        .map(|arg| {
            if arg == &plugin.package {
                package_with_version.clone()
            } else {
                arg.clone()
            }
        })
        .collect()
}

fn resolve_install_command_program(
    node_dir: &Path,
    node_exe: &Path,
    install_command: &PluginInstallCommand,
) -> anyhow::Result<PathBuf> {
    if !install_command.uses_managed_node_path {
        return Ok(PathBuf::from(&install_command.executable));
    }

    let executable = install_command.executable.to_ascii_lowercase();
    let program = match executable.as_str() {
        "node" | "node.exe" => node_exe.to_path_buf(),
        "npm" | "npm.cmd" => node_runtime_npm_command(node_dir),
        "npx" | "npx.cmd" => node_runtime_npx_command(node_dir),
        _ => PathBuf::from(&install_command.executable),
    };

    if !program.exists() {
        anyhow::bail!("受管命令不存在：{}", program.display());
    }

    Ok(program)
}

fn ensure_version_matches(version: &Version, range: &str, label: &str) -> anyhow::Result<()> {
    let normalized = range.split_whitespace().collect::<Vec<_>>().join(", ");
    let requirement = VersionReq::parse(&normalized)
        .with_context(|| format!("解析 {label} 版本范围失败：{range}"))?;
    if !requirement.matches(version) {
        anyhow::bail!("{label} 版本 {} 不满足插件要求 {}", version, range);
    }

    Ok(())
}

fn parse_semver_like(value: &str) -> anyhow::Result<Version> {
    Version::parse(value).with_context(|| format!("解析版本失败：{}", value))
}

fn update_installed_manifest(
    manifest_path: &Path,
    installed_manifest: &InstalledManifest,
    plugin: &PluginArtifact,
    discovered_plugins: &[InstalledPlugin],
) -> anyhow::Result<()> {
    let mut updated = installed_manifest.clone();
    updated.plugins.retain(|item| {
        item.id != plugin.id
            && item.id != plugin.plugin_entry_id
            && item.package.as_deref() != Some(plugin.package.as_str())
    });

    let discovered = discovered_plugins.iter().find(|item| {
        item.id.eq_ignore_ascii_case(&plugin.id)
            || item.id.eq_ignore_ascii_case(&plugin.plugin_entry_id)
            || item.package.as_deref() == Some(plugin.package.as_str())
    });

    updated
        .plugins
        .push(discovered.cloned().unwrap_or_else(|| InstalledPlugin {
            id: plugin.plugin_entry_id.clone(),
            version: plugin.version.clone(),
            package: Some(plugin.package.clone()),
        }));
    updated
        .plugins
        .sort_by(|left, right| left.id.cmp(&right.id));

    fs::write(manifest_path, serde_json::to_string_pretty(&updated)?)
        .with_context(|| format!("write installed manifest {}", manifest_path.display()))?;
    Ok(())
}

fn remove_plugin_from_installed_manifest(
    manifest_path: &Path,
    installed_manifest: &InstalledManifest,
    plugin: &PluginArtifact,
    discovered_plugins: &[InstalledPlugin],
) -> anyhow::Result<()> {
    let mut updated = installed_manifest.clone();
    updated.plugins = updated
        .plugins
        .into_iter()
        .filter(|item| {
            item.id != plugin.id
                && item.id != plugin.plugin_entry_id
                && item.package.as_deref() != Some(plugin.package.as_str())
        })
        .collect();

    for discovered in discovered_plugins {
        let exists = updated.plugins.iter().any(|item| {
            item.id.eq_ignore_ascii_case(&discovered.id)
                || match (&item.package, &discovered.package) {
                    (Some(left), Some(right)) => left.eq_ignore_ascii_case(right),
                    _ => false,
                }
        });
        if !exists {
            updated.plugins.push(discovered.clone());
        }
    }

    updated.plugins.sort_by(|left, right| left.id.cmp(&right.id));
    fs::write(manifest_path, serde_json::to_string_pretty(&updated)?)
        .with_context(|| format!("write installed manifest {}", manifest_path.display()))?;
    Ok(())
}

fn uninstall_plugin_via_official_command(
    cli_context: &OpenClawCliContext,
    plugin: &PluginArtifact,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
) -> anyhow::Result<()> {
    progress_callback.map(|callback| {
        callback(&PluginInstallProgress {
            stage: "uninstalling".to_string(),
            progress: 64,
            message: "正在调用 OpenClaw 官方插件卸载流程...".to_string(),
            done: false,
            failed: false,
        })
    });
    eprintln!(
        "[Plugin 卸载] 准备执行命令: openclaw plugins uninstall {} --force",
        plugin.plugin_entry_id
    );

    uninstall_plugin(cli_context, &plugin.plugin_entry_id)
        .or_else(|_| uninstall_plugin(cli_context, &plugin.id))
        .or_else(|_| uninstall_plugin(cli_context, &plugin.package))
}

fn prepare_config_for_plugin_uninstall(
    config_path: &Path,
    plugin: &PluginArtifact,
) -> anyhow::Result<bool> {
    let raw = fs::read_to_string(config_path)
        .with_context(|| format!("read openclaw config {}", config_path.display()))?;
    let mut config: serde_json::Value = serde_json::from_str(&raw)
        .with_context(|| format!("parse openclaw config {}", config_path.display()))?;

    let mut changed = false;
    if let Some(entries) = config
        .get_mut("plugins")
        .and_then(|plugins| plugins.get_mut("entries"))
        .and_then(serde_json::Value::as_object_mut)
    {
        let mut keys = vec![plugin.id.clone(), plugin.plugin_entry_id.clone()];
        keys.extend(plugin.aliases.iter().cloned());

        for key in keys {
            let Some(entry) = entries.get_mut(&key) else {
                continue;
            };
            let Some(entry_obj) = entry.as_object_mut() else {
                continue;
            };
            let enabled_value = entry_obj
                .entry("enabled".to_string())
                .or_insert(serde_json::Value::Bool(false));
            if enabled_value.as_bool() != Some(false) {
                *enabled_value = serde_json::Value::Bool(false);
                changed = true;
            }
        }
    }

    if let Some(channel_id) = plugin.channel_id.as_deref() {
        if let Some(channels) = config
            .get_mut("channels")
            .and_then(serde_json::Value::as_object_mut)
        {
            if channels.remove(channel_id).is_some() {
                changed = true;
            }
        }
    }

    if changed {
        fs::write(config_path, serde_json::to_string_pretty(&config)?)
            .with_context(|| format!("write openclaw config {}", config_path.display()))?;
    }

    Ok(changed)
}

fn read_installed_manifest(path: &Path) -> anyhow::Result<InstalledManifest> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("read installed manifest {}", path.display()))?;
    serde_json::from_str(&raw)
        .with_context(|| format!("parse installed manifest {}", path.display()))
}

fn resolve_resource_root_from_openclaw_dir(openclaw_dir: &Path) -> anyhow::Result<PathBuf> {
    let base_dir = openclaw_dir
        .parent()
        .and_then(Path::parent)
        .with_context(|| format!("resolve base dir from {}", openclaw_dir.display()))?;

    let mut candidates = Vec::new();
    if let Ok(explicit_root) = std::env::var("OPENCLAW_TOOLKIT_ROOT") {
        candidates.push(PathBuf::from(explicit_root));
    }
    candidates.extend(path_with_ancestors(base_dir.to_path_buf(), 4));

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.extend(path_with_ancestors(current_dir, 5));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend(path_with_ancestors(exe_dir.to_path_buf(), 6));
        }
    }

    for candidate in candidates {
        if candidate
            .join("artifacts")
            .join("toolkit-manifest.json")
            .exists()
        {
            return Ok(candidate);
        }
    }

    anyhow::bail!("未找到安装资源目录：需要存在 artifacts/toolkit-manifest.json")
}

fn path_with_ancestors(start: PathBuf, levels: usize) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut current = Some(start.as_path());

    for _ in 0..=levels {
        let Some(path) = current else {
            break;
        };
        paths.push(path.to_path_buf());
        current = path.parent();
    }

    paths
}

fn emit_plugin_install_progress(
    callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
    stage: &str,
    progress: u8,
    message: &str,
    done: bool,
    failed: bool,
) {
    if let Some(callback) = callback {
        callback(&PluginInstallProgress {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
            done,
            failed,
        });
    }
}

fn collect_plugin_install_lines(
    stream: impl std::io::Read,
    progress_callback: Option<&(dyn Fn(&PluginInstallProgress) + Sync)>,
    _is_stderr: bool,
    label: &str,
    detail_lines: &Arc<Mutex<Vec<String>>>,
) {
    let reader = BufReader::new(stream);
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let rendered = format!("[{}] {}", label, shorten_plugin_progress_line(trimmed));
        eprintln!("[Plugin 安装] {}", rendered);
        if let Ok(mut lines) = detail_lines.lock() {
            lines.push(rendered.clone());
            if lines.len() > 80 {
                let drain = lines.len().saturating_sub(80);
                lines.drain(0..drain);
            }
        }

        let _ = progress_callback;
    }
}

fn shorten_plugin_progress_line(line: &str) -> String {
    const MAX_CHARS: usize = 240;
    if line.chars().count() <= MAX_CHARS {
        return line.to_string();
    }

    let mut shortened = line.chars().take(MAX_CHARS).collect::<String>();
    shortened.push_str("...");
    shortened
}
