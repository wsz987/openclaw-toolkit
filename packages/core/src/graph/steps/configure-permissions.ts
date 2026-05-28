import fs from 'fs-extra';
import path from 'node:path';
import type { WorkflowStep } from '../types.js';

export const configurePermissionsStep: WorkflowStep = {
  id: 'configurePermissions',
  title: '配置本地权限白名单',
  description: '写入本地文件、Shell 和浏览器权限策略',
  async run(ctx) {
    await fs.ensureDir(path.join(ctx.runtimeDir, 'config'));
    await fs.writeJson(path.join(ctx.runtimeDir, 'config', 'permissions.applied.json'), {
      appliedAt: new Date().toISOString(),
      configPath: ctx.configPath
    }, { spaces: 2 });
  }
};
