import type { WorkflowStep } from '../types.js';

export const selectInstallModeStep: WorkflowStep = {
  id: 'selectInstallMode',
  title: '选择安装模式',
  description: '确定使用本地离线包、内网制品服务器或官方 npm 下载指定版本安装',
  async run(ctx) {
    ctx.installMode ??= 'local';
  }
};
