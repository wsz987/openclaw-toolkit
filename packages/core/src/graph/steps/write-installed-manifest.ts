import path from 'node:path';
import { writeInstalledManifest } from '../../manifest/manifest-store.js';
import type { WorkflowStep } from '../types.js';

export const writeInstalledManifestStep: WorkflowStep = {
  id: 'writeInstalledManifest',
  title: '写入安装状态',
  description: '记录当前工具包和 OpenClaw 已安装版本状态',
  async run(ctx) {
    if (!ctx.toolkitManifest || !ctx.artifact || !ctx.installMode) {
      throw new Error('安装状态缺少必要上下文');
    }

    await writeInstalledManifest(path.join(ctx.runtimeDir, 'installed-manifest.json'), {
      toolkitVersion: ctx.toolkitManifest.toolkitVersion,
      openclawVersion: ctx.artifact.version,
      installMode: ctx.installMode,
      installedAt: new Date().toISOString(),
      runtimeDir: ctx.runtimeDir,
      configPath: ctx.configPath,
      skills: ctx.artifact.skills
    });
  }
};
