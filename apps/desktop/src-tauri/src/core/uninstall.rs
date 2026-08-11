use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::core::{
    app_state::{load_install_registry, unregister_installation, InstallationRecord},
    openclaw_config::read_openclaw_status,
    runtime_manager::RuntimeManager,
};

const CONFIRMATION_TEXT: &str = "DELETE OPENCLAW";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallPlan {
    pub plan_id: String,
    pub installation_id: String,
    pub display_name: String,
    pub base_dir: String,
    pub openclaw_dir: String,
    pub runtime: RuntimeStopPlan,
    pub targets: Vec<DeletionTarget>,
    pub retained: Vec<RetainedPath>,
    pub warnings: Vec<String>,
    pub requires_typed_confirmation: bool,
    pub confirmation_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStopPlan {
    pub running: bool,
    pub pid: Option<u32>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletionTarget {
    pub scope: String,
    pub path: String,
    pub kind: String,
    pub estimated_bytes: Option<u64>,
    pub selected_by_default: bool,
    pub risk: String,
    pub reason: String,
    pub owned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetainedPath {
    pub label: String,
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteUninstallInput {
    pub installation_id: String,
    #[serde(default)]
    pub selected_scopes: Vec<String>,
    pub typed_confirmation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    pub installation_id: String,
    pub status: String,
    pub deleted_scopes: Vec<String>,
    pub retained: Vec<RetainedPath>,
    pub warnings: Vec<String>,
}

pub fn inspect_uninstall_plan(installation_id: &str) -> anyhow::Result<UninstallPlan> {
    eprintln!(
        "[卸载] 开始检查卸载计划: installation_id={}",
        installation_id
    );
    let record = find_installation_record(installation_id)?;
    let plan = build_uninstall_plan(&record)?;
    eprintln!(
        "[卸载] 卸载计划已生成: installation_id={}, display_name={}, target_count={}, retained_count={}",
        plan.installation_id,
        plan.display_name,
        plan.targets.len(),
        plan.retained.len()
    );
    Ok(plan)
}

pub fn execute_uninstall(
    input: ExecuteUninstallInput,
    runtime_manager: &RuntimeManager,
) -> anyhow::Result<UninstallResult> {
    eprintln!(
        "[卸载] 开始执行: installation_id={}, requested_scopes={:?}",
        input.installation_id, input.selected_scopes
    );
    let record = find_installation_record(&input.installation_id)?;
    let plan = build_uninstall_plan(&record)?;
    let selected_scopes = normalize_selected_scopes(&input.selected_scopes, &plan);
    eprintln!(
        "[卸载] 解析后的删除范围: installation_id={}, scopes={:?}",
        input.installation_id, selected_scopes
    );

    validate_selected_scopes(&selected_scopes, &plan)?;
    if input.typed_confirmation.as_deref() != Some(CONFIRMATION_TEXT) {
        anyhow::bail!("请输入 {} 后再执行卸载", CONFIRMATION_TEXT);
    }
    eprintln!(
        "[卸载] 二次确认已通过: installation_id={}",
        input.installation_id
    );

    eprintln!(
        "[卸载] 删除文件前协调停止 OpenClaw: config_path={}",
        record.config_path
    );
    runtime_manager
        .stop(Path::new(&record.config_path))
        .with_context(|| format!("停止 OpenClaw 运行实例 {}", record.config_path))?;
    eprintln!(
        "[卸载] OpenClaw 运行实例已停止或已不存在: config_path={}",
        record.config_path
    );

    let mut deleted_scopes = Vec::new();
    for target in plan
        .targets
        .iter()
        .filter(|target| selected_scopes.contains(&target.scope))
    {
        eprintln!(
            "[卸载] 准备删除目标: scope={}, kind={}, path={}",
            target.scope, target.kind, target.path
        );
        validate_deletion_target(target, &record)?;
        remove_target(target, &record)?;
        eprintln!(
            "[卸载] 删除目标完成: scope={}, path={}",
            target.scope, target.path
        );
        deleted_scopes.push(target.scope.clone());
    }

    eprintln!(
        "[卸载] 准备移除安装注册记录: installation_id={}",
        input.installation_id
    );
    unregister_installation(&input.installation_id)?;
    eprintln!(
        "[卸载] 安装注册记录已移除: installation_id={}",
        input.installation_id
    );

    let result = UninstallResult {
        installation_id: input.installation_id,
        status: "uninstalled".to_string(),
        deleted_scopes,
        retained: plan.retained,
        warnings: plan.warnings,
    };
    eprintln!(
        "[卸载] 执行完成: installation_id={}, deleted_scopes={:?}, warning_count={}",
        result.installation_id,
        result.deleted_scopes,
        result.warnings.len()
    );
    Ok(result)
}

fn find_installation_record(installation_id: &str) -> anyhow::Result<InstallationRecord> {
    let registry = load_install_registry()?;
    registry
        .installations
        .into_iter()
        .find(|record| record.installation_id == installation_id)
        .with_context(|| format!("未找到安装实例：{}", installation_id))
}

fn build_uninstall_plan(record: &InstallationRecord) -> anyhow::Result<UninstallPlan> {
    let base_dir = PathBuf::from(&record.base_dir);
    let openclaw_dir = PathBuf::from(&record.openclaw_dir);
    let config_path = PathBuf::from(&record.config_path);
    let status = read_openclaw_status(&config_path).ok();
    let runtime_pid = status
        .as_ref()
        .and_then(|status| status.runtime_pid)
        .or(record.runtime_pid);
    let runtime_running = status
        .as_ref()
        .map(|status| status.runtime_running)
        .unwrap_or_else(|| record.runtime_state.eq_ignore_ascii_case("running"));
    let workspace_dir = status
        .as_ref()
        .map(|status| PathBuf::from(&status.workspace_dir))
        .unwrap_or_else(|| openclaw_dir.join("workspace"));

    let mut targets = Vec::new();
    let mut retained = Vec::new();
    let mut warnings = vec![
        "全局 OpenClaw、全局 Node.js 和系统 PATH 不属于本工具包安装范围，不会删除。".to_string(),
        "删除动作只基于安装记录和实例 manifest 解析出的受管路径执行。".to_string(),
    ];

    add_target(
        &mut targets,
        "openclawApp",
        &openclaw_dir,
        "directory",
        true,
        "medium",
        "删除受管 OpenClaw 主程序、配置、插件依赖和 installed-manifest；默认保留工作区。",
        is_owned_openclaw_dir(&base_dir, &openclaw_dir, &record.openclaw_version),
    );

    let node_dir = PathBuf::from(&record.node_dir);
    if can_remove_node_dir(record, &node_dir)? {
        add_target(
            &mut targets,
            "managedNode",
            &node_dir,
            "directory",
            false,
            "medium",
            "删除本工具包安装的受管 Node Runtime；不会影响系统全局 Node。",
            is_owned_node_dir(&base_dir, &node_dir),
        );
    } else {
        retained.push(RetainedPath {
            label: "受管 Node Runtime".to_string(),
            path: node_dir.to_string_lossy().to_string(),
            reason: "还有其他安装实例引用同一 Node Runtime，默认保留。".to_string(),
        });
    }

    add_base_child_target(
        &mut targets,
        &base_dir,
        "logs",
        "logs",
        true,
        "low",
        "删除安装日志和运行日志。",
    );
    add_base_child_target(
        &mut targets,
        &base_dir,
        "backups",
        "backups",
        false,
        "high",
        "删除安装或升级时创建的备份。",
    );

    if workspace_dir.exists() {
        if is_path_within(&workspace_dir, &base_dir) {
            add_target(
                &mut targets,
                "workspace",
                &workspace_dir,
                "directory",
                false,
                "high",
                "删除 OpenClaw 工作区，可能包含用户文件、会话和 agent 产物。",
                true,
            );
            warnings
                .push("工作区默认保留；选择 workspace 后会删除用户/agent 工作数据。".to_string());
        } else {
            retained.push(RetainedPath {
                label: "外部工作区".to_string(),
                path: workspace_dir.to_string_lossy().to_string(),
                reason: "工作区位于安装根目录外，只提示不自动删除。".to_string(),
            });
        }
    }

    retained.push(RetainedPath {
        label: "全局 OpenClaw".to_string(),
        path: "PATH/openclaw".to_string(),
        reason: "系统 PATH 中的全局 OpenClaw 不属于受管安装，不会删除。".to_string(),
    });

    Ok(UninstallPlan {
        plan_id: format!("uninstall-{}", Utc::now().timestamp_millis()),
        installation_id: record.installation_id.clone(),
        display_name: record.display_name.clone(),
        base_dir: record.base_dir.clone(),
        openclaw_dir: record.openclaw_dir.clone(),
        runtime: RuntimeStopPlan {
            running: runtime_running,
            pid: runtime_pid,
            label: if runtime_running {
                "将先停止 OpenClaw 运行进程".to_string()
            } else {
                "当前未检测到运行中的 OpenClaw 进程".to_string()
            },
        },
        targets,
        retained,
        warnings,
        requires_typed_confirmation: true,
        confirmation_text: CONFIRMATION_TEXT.to_string(),
    })
}

fn add_base_child_target(
    targets: &mut Vec<DeletionTarget>,
    base_dir: &Path,
    scope: &str,
    child_name: &str,
    selected_by_default: bool,
    risk: &str,
    reason: &str,
) {
    let path = base_dir.join(child_name);
    add_target(
        targets,
        scope,
        &path,
        "directory",
        selected_by_default,
        risk,
        reason,
        is_direct_child_named(base_dir, &path, child_name),
    );
}

fn add_target(
    targets: &mut Vec<DeletionTarget>,
    scope: &str,
    path: &Path,
    kind: &str,
    selected_by_default: bool,
    risk: &str,
    reason: &str,
    owned: bool,
) {
    targets.push(DeletionTarget {
        scope: scope.to_string(),
        path: path.to_string_lossy().to_string(),
        kind: kind.to_string(),
        estimated_bytes: estimate_path_size(path),
        selected_by_default,
        risk: risk.to_string(),
        reason: reason.to_string(),
        owned,
    });
}

fn normalize_selected_scopes(input_scopes: &[String], plan: &UninstallPlan) -> HashSet<String> {
    if input_scopes.is_empty() {
        return plan
            .targets
            .iter()
            .filter(|target| target.selected_by_default)
            .map(|target| target.scope.clone())
            .collect();
    }

    input_scopes
        .iter()
        .map(|scope| scope.trim().to_string())
        .filter(|scope| !scope.is_empty())
        .collect()
}

fn validate_selected_scopes(
    selected_scopes: &HashSet<String>,
    plan: &UninstallPlan,
) -> anyhow::Result<()> {
    if !selected_scopes.contains("openclawApp") {
        anyhow::bail!("卸载必须包含 OpenClaw 主程序目录，不能只清理附属数据");
    }

    for scope in selected_scopes {
        let Some(target) = plan.targets.iter().find(|target| &target.scope == scope) else {
            anyhow::bail!("卸载 scope 不存在：{}", scope);
        };

        if !target.owned {
            anyhow::bail!("拒绝删除非受管路径：{}", target.path);
        }
    }

    Ok(())
}

fn validate_deletion_target(
    target: &DeletionTarget,
    record: &InstallationRecord,
) -> anyhow::Result<()> {
    if !target.owned {
        anyhow::bail!("拒绝删除非受管路径：{}", target.path);
    }

    let base_dir = PathBuf::from(&record.base_dir);
    let path = PathBuf::from(&target.path);
    match target.scope.as_str() {
        "openclawApp" => {
            if !is_owned_openclaw_dir(&base_dir, &path, &record.openclaw_version) {
                anyhow::bail!("OpenClaw 主程序目录不在受管边界内：{}", path.display());
            }
        }
        "managedNode" => {
            if !is_owned_node_dir(&base_dir, &path) {
                anyhow::bail!("Node Runtime 目录不在受管边界内：{}", path.display());
            }
        }
        "logs" | "backups" => {
            if !is_direct_child_named(&base_dir, &path, &target.scope) {
                anyhow::bail!("目录不在受管边界内：{}", path.display());
            }
        }
        "workspace" => {
            if !is_path_within(&path, &base_dir) {
                anyhow::bail!("拒绝自动删除安装根目录外的 workspace：{}", path.display());
            }
        }
        _ => anyhow::bail!("未知卸载 scope：{}", target.scope),
    }

    reject_dangerous_path(&path)?;
    Ok(())
}

fn remove_target(target: &DeletionTarget, record: &InstallationRecord) -> anyhow::Result<()> {
    let path = PathBuf::from(&target.path);
    if !path.exists() {
        eprintln!(
            "[卸载] 目标不存在，跳过删除: scope={}, path={}",
            target.scope, target.path
        );
        return Ok(());
    }

    if target.scope == "openclawApp" {
        remove_openclaw_app_contents(&path, record)?;
        return Ok(());
    }

    remove_path_via_trash(&path, Path::new(&record.base_dir), &target.scope)
}

fn remove_openclaw_app_contents(
    openclaw_dir: &Path,
    record: &InstallationRecord,
) -> anyhow::Result<()> {
    eprintln!(
        "[卸载] 开始清理 OpenClaw 主目录内容: {}",
        openclaw_dir.display()
    );
    let workspace_path = openclaw_dir.join("workspace");
    let workspace_selected = false;
    let mut entries = Vec::new();
    for entry in
        fs::read_dir(openclaw_dir).with_context(|| format!("read {}", openclaw_dir.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        if !workspace_selected && same_path(&path, &workspace_path) {
            continue;
        }
        entries.push(path);
    }

    let trash_root = trash_root(Path::new(&record.base_dir), "openclawApp")?;
    for path in entries {
        eprintln!("[卸载] 清理 OpenClaw 子项: {}", path.display());
        move_then_delete(&path, &trash_root)?;
    }

    if fs::read_dir(openclaw_dir)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false)
    {
        let _ = fs::remove_dir(openclaw_dir);
        eprintln!(
            "[卸载] OpenClaw 主目录为空，已移除目录壳: {}",
            openclaw_dir.display()
        );
    } else {
        eprintln!(
            "[卸载] OpenClaw 主目录保留未删除内容（通常为 workspace）: {}",
            openclaw_dir.display()
        );
    }

    Ok(())
}

fn remove_path_via_trash(path: &Path, base_dir: &Path, label: &str) -> anyhow::Result<()> {
    let trash_root = trash_root(base_dir, label)?;
    eprintln!(
        "[卸载] 通过临时回收目录删除: label={}, path={}, trash_root={}",
        label,
        path.display(),
        trash_root.display()
    );
    move_then_delete(path, &trash_root)
}

fn move_then_delete(path: &Path, trash_root: &Path) -> anyhow::Result<()> {
    if !path.exists() {
        return Ok(());
    }

    fs::create_dir_all(trash_root).with_context(|| format!("create {}", trash_root.display()))?;
    let file_name = path
        .file_name()
        .map(|value| value.to_owned())
        .unwrap_or_else(|| "target".into());
    let destination = unique_trash_path(trash_root.join(file_name));

    match fs::rename(path, &destination) {
        Ok(()) => {
            eprintln!(
                "[卸载] 已移动到临时目录，继续删除: source={}, destination={}",
                path.display(),
                destination.display()
            );
            remove_moved_path(&destination)
        }
        Err(rename_error) => {
            eprintln!(
                "[卸载] 移动到临时目录失败，直接删除原路径: source={}, destination={}, reason={}",
                path.display(),
                destination.display(),
                rename_error
            );
            if is_real_dir(path) {
                remove_dir_all::remove_dir_all(path).with_context(|| {
                    format!(
                        "delete {} after rename to {} failed: {}",
                        path.display(),
                        destination.display(),
                        rename_error
                    )
                })?;
            } else {
                fs::remove_file(path).with_context(|| {
                    format!(
                        "delete {} after rename to {} failed: {}",
                        path.display(),
                        destination.display(),
                        rename_error
                    )
                })?;
            }
            Ok(())
        }
    }
}

fn remove_moved_path(path: &Path) -> anyhow::Result<()> {
    if is_real_dir(path) {
        eprintln!("[卸载] 删除目录: {}", path.display());
        remove_dir_all::remove_dir_all(path)
            .with_context(|| format!("delete {}", path.display()))?;
    } else if path.exists() {
        eprintln!("[卸载] 删除文件: {}", path.display());
        fs::remove_file(path).with_context(|| format!("delete {}", path.display()))?;
    }

    Ok(())
}

fn is_real_dir(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_dir())
        .unwrap_or(false)
}

fn trash_root(base_dir: &Path, label: &str) -> anyhow::Result<PathBuf> {
    Ok(base_dir.join(".trash").join(format!(
        "uninstall-{}-{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        label
    )))
}

fn unique_trash_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("target");
    let extension = path.extension().and_then(|value| value.to_str());

    for index in 1..1000 {
        let file_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!("{stem}-{}", Utc::now().timestamp_millis()))
}

fn can_remove_node_dir(record: &InstallationRecord, node_dir: &Path) -> anyhow::Result<bool> {
    let registry = load_install_registry()?;
    Ok(!registry.installations.iter().any(|candidate| {
        candidate.installation_id != record.installation_id
            && same_path(&candidate.node_dir, node_dir)
    }))
}

fn estimate_path_size(path: &Path) -> Option<u64> {
    if !path.exists() {
        return Some(0);
    }

    let metadata = fs::symlink_metadata(path).ok()?;
    if metadata.is_file() {
        return Some(metadata.len());
    }
    if !metadata.is_dir() {
        return Some(0);
    }

    let mut total = 0_u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(current).ok()?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let metadata = fs::symlink_metadata(&entry_path).ok()?;
            if metadata.is_dir() {
                stack.push(entry_path);
            } else {
                total = total.saturating_add(metadata.len());
            }
        }
    }

    Some(total)
}

fn reject_dangerous_path(path: &Path) -> anyhow::Result<()> {
    if path.as_os_str().is_empty() {
        anyhow::bail!("拒绝删除空路径");
    }

    if path.parent().is_none() {
        anyhow::bail!("拒绝删除根目录：{}", path.display());
    }

    let lowered = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    for blocked in [
        "\\windows",
        "\\windows\\system32",
        "\\program files",
        "\\program files (x86)",
        "\\users",
        "\\appdata",
    ] {
        if lowered.ends_with(blocked) {
            anyhow::bail!("拒绝删除系统目录：{}", path.display());
        }
    }

    Ok(())
}

fn is_owned_openclaw_dir(base_dir: &Path, openclaw_dir: &Path, version: &str) -> bool {
    same_path(openclaw_dir, base_dir.join("openclaw").join(version))
}

fn is_owned_node_dir(base_dir: &Path, node_dir: &Path) -> bool {
    is_path_within(node_dir, &base_dir.join("runtimes").join("node"))
        && node_dir
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.ends_with("-win-x64"))
            .unwrap_or(false)
}

fn is_direct_child_named(base_dir: &Path, path: &Path, child_name: &str) -> bool {
    same_path(path, base_dir.join(child_name))
}

fn is_path_within(path: &Path, base: &Path) -> bool {
    let normalized_path = normalize_for_compare(path);
    let normalized_base = normalize_for_compare(base);
    normalized_path == normalized_base
        || normalized_path
            .strip_prefix(&(normalized_base + "\\"))
            .is_some()
}

fn normalize_for_compare(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn same_path(left: impl AsRef<Path>, right: impl AsRef<Path>) -> bool {
    normalize_for_compare(left.as_ref()) == normalize_for_compare(right.as_ref())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{is_owned_node_dir, is_owned_openclaw_dir, remove_openclaw_app_contents};
    use crate::core::app_state::InstallationRecord;

    #[test]
    fn owned_openclaw_dir_requires_version_child() {
        let base = std::path::PathBuf::from(r"D:\OpenClaw");
        assert!(is_owned_openclaw_dir(
            &base,
            &std::path::PathBuf::from(r"D:\OpenClaw\openclaw\2026.5.20"),
            "2026.5.20"
        ));
        assert!(!is_owned_openclaw_dir(
            &base,
            &std::path::PathBuf::from(r"D:\OpenClaw\openclaw"),
            "2026.5.20"
        ));
    }

    #[test]
    fn owned_node_dir_requires_managed_runtime_root() {
        let base = std::path::PathBuf::from(r"D:\OpenClaw");
        assert!(is_owned_node_dir(
            &base,
            &std::path::PathBuf::from(r"D:\OpenClaw\runtimes\node\22.19.0-win-x64")
        ));
        assert!(!is_owned_node_dir(
            &base,
            &std::path::PathBuf::from(r"C:\Program Files\nodejs")
        ));
    }

    #[test]
    fn openclaw_app_removal_preserves_workspace() {
        let base = unique_temp_dir("uninstall-preserve-workspace");
        let openclaw_dir = base.join("openclaw").join("2026.5.20");
        let package_dir = openclaw_dir.join("package");
        let workspace_dir = openclaw_dir.join("workspace");
        fs::create_dir_all(&package_dir).unwrap();
        fs::create_dir_all(&workspace_dir).unwrap();
        fs::write(package_dir.join("openclaw.mjs"), "entry").unwrap();
        fs::write(workspace_dir.join("note.md"), "keep").unwrap();
        fs::write(openclaw_dir.join("openclaw.json"), "{}").unwrap();

        let record = InstallationRecord {
            installation_id: "inst_test".to_string(),
            display_name: "OpenClaw test".to_string(),
            base_dir: base.to_string_lossy().to_string(),
            openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
            node_dir: base
                .join("runtimes")
                .join("node")
                .join("22.19.0-win-x64")
                .to_string_lossy()
                .to_string(),
            config_path: openclaw_dir
                .join("openclaw.json")
                .to_string_lossy()
                .to_string(),
            installed_manifest_path: openclaw_dir
                .join("installed-manifest.json")
                .to_string_lossy()
                .to_string(),
            install_mode: "local".to_string(),
            openclaw_version: "2026.5.20".to_string(),
            node_version: "22.19.0".to_string(),
            status: "installed".to_string(),
            config_state: "ready".to_string(),
            runtime_state: "stopped".to_string(),
            provider_state: "ready".to_string(),
            panel_state: "unavailable".to_string(),
            runtime_action_required: "none".to_string(),
            pending_config_changes: Vec::new(),
            runtime_pid: None,
            runtime_log_path: None,
            gateway_ready: false,
            runtime_host_kind: "direct-process".to_string(),
            installed_at: "2026-06-10T00:00:00Z".to_string(),
            last_validated_at: None,
            last_launched_at: None,
            last_error: None,
        };

        remove_openclaw_app_contents(&openclaw_dir, &record).unwrap();

        assert!(workspace_dir.join("note.md").exists());
        assert!(!package_dir.exists());
        assert!(!openclaw_dir.join("openclaw.json").exists());

        fs::remove_dir_all(base).unwrap();
    }

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("openclaw-{label}-{suffix}"))
    }
}
