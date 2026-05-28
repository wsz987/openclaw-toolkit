import path from 'node:path';
import type { ReleaseArtifact } from '@openclaw-toolkit/schemas';
import type { WorkflowStep } from '../types.js';

export const resolveArtifactStep: WorkflowStep = {
  id: 'resolveArtifact',
  title: '解析安装制品',
  description: '根据安装模式和目标版本解析需要安装的 OpenClaw 制品',
  async run(ctx) {
    if (!ctx.releaseManifest) {
      throw new Error('release manifest 未加载');
    }

    const artifact = ctx.releaseManifest.releases.find((release: ReleaseArtifact) => release.version === ctx.selectedVersion);
    if (!artifact) {
      throw new Error(`未找到 OpenClaw 版本 ${ctx.selectedVersion} 的制品`);
    }

    if (ctx.installMode === 'local') {
      artifact.artifact = path.join(ctx.projectRoot, 'artifacts', 'openclaw', artifact.artifact);
    }

    ctx.artifact = artifact;
  }
};
