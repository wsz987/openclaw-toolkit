import fs from 'fs-extra';
import { sha256File } from '../../artifacts/hash.js';
import type { WorkflowStep } from '../types.js';

export const verifyArtifactStep: WorkflowStep = {
  id: 'verifyArtifact',
  title: '校验制品完整性',
  description: '校验 OpenClaw 安装包 sha256 和签名预留字段',
  async run(ctx) {
    if (!ctx.artifact) {
      throw new Error('OpenClaw 安装制品未解析');
    }

    if (ctx.installMode === 'local') {
      if (!(await fs.pathExists(ctx.artifact.artifact))) {
        throw new Error(`本地离线包不存在：${ctx.artifact.artifact}`);
      }

      const hash = await sha256File(ctx.artifact.artifact);
      if (hash !== ctx.artifact.sha256) {
        throw new Error(`制品 sha256 不匹配：expected=${ctx.artifact.sha256}, actual=${hash}`);
      }
    }
  }
};
