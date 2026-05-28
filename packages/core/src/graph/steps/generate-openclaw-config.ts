import fs from 'fs-extra';
import type { WorkflowStep } from '../types.js';

export const generateOpenClawConfigStep: WorkflowStep = {
  id: 'generateOpenClawConfig',
  title: '生成 openclaw.json',
  description: '根据授权、版本和权限模板生成 OpenClaw 配置',
  async run(ctx) {
    await fs.ensureDir(ctx.runtimeDir);
    await fs.writeJson(ctx.configPath, {
      version: 1,
      openclawVersion: ctx.selectedVersion,
      tier: ctx.tier,
      runtime: {
        workspaceDir: `${ctx.runtimeDir}\\workspace`
      },
      permissions: {
        filesystem: {
          allowRead: [`${ctx.runtimeDir}\\workspace`, `${ctx.runtimeDir}\\config`],
          allowWrite: [`${ctx.runtimeDir}\\workspace`],
          deny: ['C:\\Windows', 'C:\\Program Files']
        },
        shell: {
          enabled: true,
          allowCommands: ['node', 'npm', 'openclaw', 'powershell'],
          denyPatterns: ['Remove-Item\\s+-Recurse', 'format\\s+', 'reg\\s+delete', 'net\\s+user']
        },
        browser: {
          enabled: true,
          mode: 'managed-edge',
          allowDomains: ['localhost', '*.intranet.local']
        }
      },
      skills: ctx.artifact?.skills ?? [],
      providers: [],
      plugins: {}
    }, { spaces: 2 });
  }
};
