import os from 'node:os';
import process from 'node:process';
import type { WorkflowStep } from '../types.js';

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Windows 版本格式无效：${version}`);
  }

  return [parts[0], parts[1], parts[2] ?? 0];
}

function compareVersion(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

export const checkEnvironmentStep: WorkflowStep = {
  id: 'checkEnvironment',
  title: '检查 Windows 环境',
  description: '检查操作系统、Node 运行时和基础目录',
  async run(ctx) {
    if (process.platform !== 'win32') {
      throw new Error('Stage 1 当前仅支持 Windows 环境');
    }

    const toolkitManifest = ctx.toolkitManifest as typeof ctx.toolkitManifest & {
      environment?: { windows?: { minVersion?: string } };
    };
    const minVersion = toolkitManifest.environment?.windows?.minVersion ?? '10.0.0';
    const currentVersion = os.release();
    if (compareVersion(parseVersion(currentVersion), parseVersion(minVersion)) < 0) {
      throw new Error(`当前系统版本 ${currentVersion}，最低要求 ${minVersion}`);
    }
  }
};
