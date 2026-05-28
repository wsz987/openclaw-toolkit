import path from 'node:path';
import fs from 'fs-extra';
import type { WorkflowStep } from '../types.js';

export const backupExistingRuntimeStep: WorkflowStep = {
  id: 'backupExistingRuntime',
  title: '备份已有运行环境',
  description: '安装前备份已有 OpenClaw runtime 和配置',
  async run(ctx) {
    const backupDir = path.join(ctx.runtimeDir, '..', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
    if (await fs.pathExists(ctx.runtimeDir)) {
      await fs.ensureDir(path.dirname(backupDir));
      await fs.copy(ctx.runtimeDir, backupDir, { overwrite: false });
    }
  }
};
