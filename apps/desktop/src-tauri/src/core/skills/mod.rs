use std::{fs, path::Path};

use anyhow::Context;

use crate::core::manifest::models::ReleaseSkill;

pub fn install_skills(openclaw_dir: &Path, skills: &[ReleaseSkill]) -> anyhow::Result<()> {
    let skills_dir = openclaw_dir.join("skills");
    fs::create_dir_all(&skills_dir)
        .with_context(|| format!("create skills dir {}", skills_dir.display()))?;
    fs::write(
        skills_dir.join("installed-skills.json"),
        serde_json::to_string_pretty(skills)?,
    )?;
    Ok(())
}
