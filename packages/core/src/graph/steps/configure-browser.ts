import type { WorkflowStep } from '../types.js';

export const configureBrowserStep: WorkflowStep = {
  id: 'configureBrowser',
  title: '配置浏览器运行环境',
  description: '检测 Edge/Chrome 或离线 Chromium 运行环境',
  async run() {
    // 后续接入 playwright-core，通过可配置路径检测 Edge/Chrome/离线 Chromium。
  }
};
