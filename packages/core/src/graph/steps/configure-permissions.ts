import fs from 'fs-extra';
import path from 'node:path';
import type { WorkflowStep } from '../types.js';

export const configurePermissionsStep: WorkflowStep = {
  id: 'configurePermissions',
  title: '配置 Agent 工具策略',
  description: '记录已应用的 tools 与 sandbox 配置策略',
  async run(ctx) {
    await fs.ensureDir(path.join(ctx.runtimeDir, 'config'));
    await fs.writeJson(path.join(ctx.runtimeDir, 'config', 'permissions.applied.json'), {
      appliedAt: new Date().toISOString(),
      configPath: ctx.configPath,
      strategy: 'tools-and-sandbox'
    }, { spaces: 2 });
  }
};
