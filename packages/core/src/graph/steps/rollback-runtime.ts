import type { WorkflowStep } from '../types.js';

export const rollbackRuntimeStep: WorkflowStep = {
  id: 'rollbackRuntime',
  title: '回滚安装现场',
  description: '安装失败后恢复备份并保留日志',
  async run() {
    // 后续按 installed-manifest 和 backups 目录恢复运行环境。
  }
};
