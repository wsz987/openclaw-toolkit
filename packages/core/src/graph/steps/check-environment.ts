import process from 'node:process';
import type { WorkflowStep } from '../types.js';

export const checkEnvironmentStep: WorkflowStep = {
  id: 'checkEnvironment',
  title: '检查 Windows 环境',
  description: '检查操作系统、Node 运行时和基础目录',
  async run() {
    if (process.platform !== 'win32') {
      throw new Error('Stage 1 当前仅支持 Windows 环境');
    }
  }
};
