import path from 'node:path';
import fs from 'fs-extra';
import type { WorkflowStep } from '../types.js';

export const installRuntimeStep: WorkflowStep = {
  id: 'installRuntime',
  title: '安装 OpenClaw Runtime',
  description: '安装或解压 OpenClaw 到目标运行目录',
  async run(ctx) {
    await fs.ensureDir(ctx.runtimeDir);
    await fs.writeJson(path.join(ctx.runtimeDir, '.install-placeholder.json'), {
      artifact: ctx.artifact,
      installMode: ctx.installMode,
      installedAt: new Date().toISOString()
    }, { spaces: 2 });
  }
};
