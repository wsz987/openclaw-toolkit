import fs from 'fs-extra';
import path from 'node:path';
import type { WorkflowStep } from '../types.js';

export const installSkillsStep: WorkflowStep = {
  id: 'installSkills',
  title: '安装 Skill 插件',
  description: '安装 release manifest 中声明的 Stage 1 skills',
  async run(ctx) {
    const skillsDir = path.join(ctx.runtimeDir, 'skills');
    await fs.ensureDir(skillsDir);
    await fs.writeJson(path.join(skillsDir, 'installed-skills.json'), ctx.artifact?.skills ?? [], { spaces: 2 });
  }
};
