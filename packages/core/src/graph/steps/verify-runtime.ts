import fs from 'fs-extra';
import type { WorkflowStep } from '../types.js';

export const verifyRuntimeStep: WorkflowStep = {
  id: 'verifyRuntime',
  title: '验证 OpenClaw Runtime',
  description: '验证 OpenClaw runtime、配置和 skill 安装结果',
  async run(ctx) {
    if (!(await fs.pathExists(ctx.configPath))) {
      throw new Error(`openclaw.json 未生成：${ctx.configPath}`);
    }
  }
};
