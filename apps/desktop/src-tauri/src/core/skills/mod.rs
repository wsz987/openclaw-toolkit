use std::{
    collections::BTreeSet,
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::Context;
use serde_json::{json, Value};

use crate::core::{
    artifact::{copy_tree, prepare_clean_dir},
    manifest::{
        load_skill_manifest,
        models::{ReleaseSkill, SkillArtifact},
        resolve_resource_root_from_config_path,
    },
};

const INSTALLED_SKILLS_RECORD: &str = "installed-skills.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkillStatus {
    pub id: String,
    pub name: String,
    pub version: String,
    pub title: String,
    pub description: String,
    pub category: Option<String>,
    pub bundled: bool,
    pub installed: bool,
    pub enabled: bool,
    pub install_by_default: bool,
    pub enabled_by_default: bool,
    pub source_dir: Option<String>,
    pub installed_path: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkillCatalog {
    pub config_path: String,
    pub openclaw_dir: String,
    pub skills_dir: String,
    pub skills: Vec<ManagedSkillStatus>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillToggleInput {
    pub config_path: String,
    pub skill_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillToggleResult {
    pub config_path: String,
    pub skill_id: String,
    pub enabled: bool,
}

pub fn install_skills(
    project_root: &Path,
    openclaw_dir: &Path,
    release_skills: &[ReleaseSkill],
) -> anyhow::Result<Vec<ReleaseSkill>> {
    let manifest = load_skill_manifest(project_root)?;
    let skills_dir = managed_skills_dir(openclaw_dir);
    fs::create_dir_all(&skills_dir)
        .with_context(|| format!("create skills dir {}", skills_dir.display()))?;

    let planned_skills = resolve_default_skills_from_manifest(&manifest.skills, release_skills);
    let desired_names = desired_release_skill_names(&planned_skills);

    for skill in &manifest.skills {
        let should_install = desired_names.contains(skill.name.as_str())
            || desired_names.contains(skill.id.as_str())
            || skill
                .aliases
                .iter()
                .any(|alias| desired_names.contains(alias.as_str()));

        if !should_install {
            continue;
        }

        if let Some(source_dir) = skill.source_dir.as_deref() {
            let source_path = resolve_skill_source_dir(project_root, source_dir)?;
            if !source_path.join("SKILL.md").exists() {
                anyhow::bail!("内置 skill 缺少 SKILL.md：{}", source_path.display());
            }

            let target_path = skills_dir.join(&skill.name);
            prepare_clean_dir(&target_path)?;
            copy_tree(&source_path, &target_path)?;
        }
    }

    write_installed_skills_record(&skills_dir, &planned_skills)?;
    Ok(planned_skills)
}

pub fn resolve_default_skills(
    project_root: &Path,
    release_skills: &[ReleaseSkill],
) -> anyhow::Result<Vec<ReleaseSkill>> {
    let manifest = load_skill_manifest(project_root)?;
    Ok(resolve_default_skills_from_manifest(
        &manifest.skills,
        release_skills,
    ))
}

pub fn inspect_skill_catalog(config_path: &Path) -> anyhow::Result<ManagedSkillCatalog> {
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let project_root = resolve_resource_root_from_config_path(config_path)?;
    let manifest = load_skill_manifest(&project_root)?;
    let config = read_config_value(config_path)?;
    let allowlist = skill_allowlist(&config);
    let explicitly_disabled = disabled_skill_ids(&config);
    let skills_dir = managed_skills_dir(openclaw_dir);

    let mut skills: Vec<ManagedSkillStatus> = manifest
        .skills
        .iter()
        .map(|skill| {
            let installed_path = skills_dir.join(&skill.name);
            let installed = installed_path.join("SKILL.md").exists();
            let enabled = is_skill_enabled(skill, &allowlist, &explicitly_disabled);

            ManagedSkillStatus {
                id: skill.id.clone(),
                name: skill.name.clone(),
                version: skill.version.clone(),
                title: skill.title.clone(),
                description: skill.description.clone(),
                category: skill.category.clone(),
                bundled: skill.bundled,
                installed,
                enabled,
                install_by_default: skill.install_by_default,
                enabled_by_default: skill.enabled_by_default,
                source_dir: skill.source_dir.clone(),
                installed_path: installed.then(|| installed_path.to_string_lossy().to_string()),
                tags: skill.tags.clone(),
            }
        })
        .collect();

    skills.sort_by(|left, right| {
        left.category
            .cmp(&right.category)
            .then_with(|| left.title.cmp(&right.title))
    });

    Ok(ManagedSkillCatalog {
        config_path: config_path.to_string_lossy().to_string(),
        openclaw_dir: openclaw_dir.to_string_lossy().to_string(),
        skills_dir: skills_dir.to_string_lossy().to_string(),
        skills,
    })
}

pub fn set_skill_enabled(input: &SkillToggleInput) -> anyhow::Result<SkillToggleResult> {
    let config_path = PathBuf::from(&input.config_path);
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let project_root = resolve_resource_root_from_config_path(&config_path)?;
    let manifest = load_skill_manifest(&project_root)?;
    let skill = resolve_skill(&manifest.skills, &input.skill_id)?;

    if input.enabled {
        ensure_skill_installed(&project_root, openclaw_dir, skill)?;
    }

    let mut config = read_config_value(&config_path)?;
    ensure_managed_skills_dir_config(&mut config, openclaw_dir);
    write_skill_entry_enabled(&mut config, &skill.name, input.enabled);
    let mut allowlist = skill_allowlist(&config);
    if input.enabled {
        allowlist.insert(skill.name.clone());
    } else {
        allowlist.remove(&skill.name);
    }
    write_skill_allowlist(&mut config, &allowlist);
    write_config_value(&config_path, &config)?;

    Ok(SkillToggleResult {
        config_path: config_path.to_string_lossy().to_string(),
        skill_id: skill.id.clone(),
        enabled: input.enabled,
    })
}

pub fn ensure_managed_skills_config(config_path: &Path) -> anyhow::Result<()> {
    let openclaw_dir = config_path
        .parent()
        .with_context(|| format!("resolve openclaw dir from {}", config_path.display()))?;
    let mut config = read_config_value(config_path)?;
    ensure_managed_skills_dir_config(&mut config, openclaw_dir);
    write_config_value(config_path, &config)
}

fn ensure_skill_installed(
    project_root: &Path,
    openclaw_dir: &Path,
    skill: &SkillArtifact,
) -> anyhow::Result<()> {
    let Some(source_dir) = skill.source_dir.as_deref() else {
        return Ok(());
    };

    let source_path = resolve_skill_source_dir(project_root, source_dir)?;
    if !source_path.join("SKILL.md").exists() {
        anyhow::bail!("内置 skill 缺少 SKILL.md：{}", source_path.display());
    }

    let target_path = managed_skills_dir(openclaw_dir).join(&skill.name);
    if target_path.join("SKILL.md").exists() {
        return Ok(());
    }

    prepare_clean_dir(&target_path)?;
    copy_tree(&source_path, &target_path)
}

fn resolve_skill<'a>(
    skills: &'a [SkillArtifact],
    requested_skill_id: &str,
) -> anyhow::Result<&'a SkillArtifact> {
    let requested = requested_skill_id.trim();
    skills
        .iter()
        .find(|skill| {
            skill.id.eq_ignore_ascii_case(requested)
                || skill.name.eq_ignore_ascii_case(requested)
                || skill
                    .aliases
                    .iter()
                    .any(|alias| alias.eq_ignore_ascii_case(requested))
        })
        .ok_or_else(|| anyhow::anyhow!("未找到内置 skill：{}", requested_skill_id))
}

fn is_skill_enabled(
    skill: &SkillArtifact,
    allowlist: &BTreeSet<String>,
    explicitly_disabled: &BTreeSet<String>,
) -> bool {
    if explicitly_disabled.contains(&skill.name) || explicitly_disabled.contains(&skill.id) {
        return false;
    }

    allowlist.contains(&skill.name)
        || allowlist.contains(&skill.id)
        || skill.aliases.iter().any(|alias| allowlist.contains(alias))
}

fn desired_release_skill_names(skills: &[ReleaseSkill]) -> BTreeSet<&str> {
    skills
        .iter()
        .map(|skill| skill.name.trim())
        .filter(|name| !name.is_empty())
        .collect()
}

fn merge_release_skills(base: &[ReleaseSkill], installed: &[ReleaseSkill]) -> Vec<ReleaseSkill> {
    let mut seen = BTreeSet::new();
    let mut merged = Vec::new();

    for skill in base.iter().chain(installed.iter()) {
        if skill.name.trim().is_empty() {
            continue;
        }

        if seen.insert(skill.name.clone()) {
            merged.push(skill.clone());
        }
    }

    merged
}

fn release_skill_from_artifact(skill: &SkillArtifact) -> ReleaseSkill {
    ReleaseSkill {
        name: skill.name.clone(),
        version: skill.version.clone(),
    }
}

fn resolve_default_skills_from_manifest(
    manifest_skills: &[SkillArtifact],
    release_skills: &[ReleaseSkill],
) -> Vec<ReleaseSkill> {
    let requested_names = desired_release_skill_names(release_skills);
    let default_catalog_skills: Vec<ReleaseSkill> = manifest_skills
        .iter()
        .filter(|skill| {
            skill.install_by_default
                || skill.enabled_by_default
                || requested_names.contains(skill.name.as_str())
                || requested_names.contains(skill.id.as_str())
                || skill
                    .aliases
                    .iter()
                    .any(|alias| requested_names.contains(alias.as_str()))
        })
        .map(release_skill_from_artifact)
        .collect();

    let mut merged = merge_release_skills(release_skills, &default_catalog_skills);
    merged.sort_by(|left, right| left.name.cmp(&right.name));
    merged
}

fn write_installed_skills_record(skills_dir: &Path, skills: &[ReleaseSkill]) -> anyhow::Result<()> {
    fs::write(
        skills_dir.join(INSTALLED_SKILLS_RECORD),
        serde_json::to_string_pretty(skills)?,
    )?;
    Ok(())
}

fn managed_skills_dir(openclaw_dir: &Path) -> PathBuf {
    openclaw_dir.join("skills")
}

fn resolve_skill_source_dir(project_root: &Path, source_dir: &str) -> anyhow::Result<PathBuf> {
    let source_dir = source_dir.trim();
    if source_dir.is_empty() {
        anyhow::bail!("skill sourceDir 不能为空");
    }

    let relative = Path::new(source_dir);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        anyhow::bail!("skill sourceDir 必须是安装资源目录内的相对路径：{source_dir}");
    }

    Ok(project_root.join(relative))
}

fn read_config_value(config_path: &Path) -> anyhow::Result<Value> {
    let raw = fs::read_to_string(config_path)
        .with_context(|| format!("read {}", config_path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", config_path.display()))
}

fn write_config_value(config_path: &Path, config: &Value) -> anyhow::Result<()> {
    fs::write(config_path, serde_json::to_string_pretty(config)?)
        .with_context(|| format!("write {}", config_path.display()))?;
    Ok(())
}

fn skill_allowlist(config: &Value) -> BTreeSet<String> {
    value_at_path(config, &["agents", "defaults", "skills"])
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn disabled_skill_ids(config: &Value) -> BTreeSet<String> {
    value_at_path(config, &["skills", "entries"])
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(id, entry)| {
                    entry
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .filter(|enabled| !enabled)
                        .map(|_| id.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn write_skill_allowlist(config: &mut Value, allowlist: &BTreeSet<String>) {
    set_value_at_path(
        config,
        &["agents", "defaults", "skills"],
        Value::Array(allowlist.iter().cloned().map(Value::String).collect()),
    );
}

fn write_skill_entry_enabled(config: &mut Value, skill_name: &str, enabled: bool) {
    set_value_at_path(
        config,
        &["skills", "entries", skill_name, "enabled"],
        Value::Bool(enabled),
    );
}

fn ensure_managed_skills_dir_config(config: &mut Value, openclaw_dir: &Path) {
    let managed_dir = managed_skills_dir(openclaw_dir)
        .to_string_lossy()
        .to_string();
    let mut extra_dirs: Vec<String> = value_at_path(config, &["skills", "load", "extraDirs"])
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();

    if !extra_dirs
        .iter()
        .any(|entry| entry.eq_ignore_ascii_case(&managed_dir))
    {
        extra_dirs.push(managed_dir);
    }

    set_value_at_path(
        config,
        &["skills", "load", "extraDirs"],
        Value::Array(extra_dirs.into_iter().map(Value::String).collect()),
    );
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
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
