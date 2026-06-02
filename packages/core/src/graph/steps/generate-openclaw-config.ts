import fs from 'fs-extra';
import type { WorkflowStep } from '../types.js';

const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_GATEWAY_BIND = 'loopback';
const DEFAULT_GATEWAY_MODE = 'local';
const DEFAULT_BROWSER_PLUGIN_ID = 'browser';
const DEFAULT_FEISHU_PLUGIN_ID = 'feishu';
const DEFAULT_OPENAI_PROVIDER_API = 'openai-completions';

export const generateOpenClawConfigStep: WorkflowStep = {
  id: 'generateOpenClawConfig',
  title: '生成 openclaw.json',
  description: '根据授权、版本和权限模板生成 OpenClaw 配置',
  async run(ctx) {
    await fs.ensureDir(ctx.runtimeDir);
    const workspaceDir = `${ctx.runtimeDir}\\workspace`;
    const configDir = `${ctx.runtimeDir}\\config`;
    const nodeDir = ctx.nodeDir ?? `${ctx.runtimeDir}\\node`;
    const providers = (ctx.providerCatalog?.providers?.length ? ctx.providerCatalog.providers : [fallbackProvider()])
      .reduce<Record<string, unknown>>((acc, provider) => {
        const apiKeyEnv = provider.apiKeyEnv ?? inferApiKeyEnv(provider.id);
        acc[provider.id] = {
          api: provider.api || DEFAULT_OPENAI_PROVIDER_API,
          baseUrl: provider.baseUrl,
          apiKey: `\${${apiKeyEnv}}`,
          models: provider.models.map((model) => ({
            id: model.id,
            name: model.name,
            input: model.input ?? [],
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens
          }))
        };
        return acc;
      }, {});
    const defaultProvider = ctx.providerCatalog?.providers?.[0] ?? fallbackProvider();
    const defaultAgentModels = (ctx.providerCatalog?.providers?.length ? ctx.providerCatalog.providers : [fallbackProvider()])
      .flatMap((provider) => provider.models.map((model) => [`${provider.id}/${model.id}`, {}] as const));

    await fs.writeJson(ctx.configPath, {
      version: 1,
      openclawVersion: ctx.selectedVersion,
      tier: ctx.tier,
      gateway: {
        mode: DEFAULT_GATEWAY_MODE,
        bind: DEFAULT_GATEWAY_BIND,
        port: DEFAULT_GATEWAY_PORT,
        controlUi: {
          allowedOrigins: [
            `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`,
            `http://localhost:${DEFAULT_GATEWAY_PORT}`
          ]
        }
      },
      agents: {
        defaults: {
          model: {
            primary: defaultProvider.defaultModel
          },
          models: Object.fromEntries(defaultAgentModels),
          workspace: workspaceDir,
          heartbeat: {
            every: '0m'
          }
        }
      },
      runtime: {
        workspaceDir,
        nodeDir
      },
      permissions: {
        filesystem: {
          allowRead: [workspaceDir, configDir],
          allowWrite: [workspaceDir],
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
      models: {
        mode: 'merge',
        providers
      },
      plugins: {
        entries: {
          [DEFAULT_BROWSER_PLUGIN_ID]: {
            enabled: true
          },
          [DEFAULT_FEISHU_PLUGIN_ID]: {
            enabled: false
          }
        }
      }
    }, { spaces: 2 });
  }
};

function fallbackProvider() {
  return {
    id: 'volcengine-agent-plan',
    label: '火山引擎 Ark Agent Plan',
    api: DEFAULT_OPENAI_PROVIDER_API,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    defaultModel: 'volcengine-agent-plan/ark-code-latest',
    apiKeyEnv: 'VOLCANO_ENGINE_API_KEY',
    aliases: ['ark-plan'],
    models: [
      {
        id: 'ark-code-latest',
        name: 'Ark Code Latest',
        input: ['text', 'image'],
        contextWindow: 256000,
        maxTokens: 32000
      }
    ]
  };
}

function inferApiKeyEnv(providerId: string): string {
  switch (providerId) {
    case 'volcengine':
    case 'volcengine-plan':
    case 'volcengine-agent-plan':
      return 'VOLCANO_ENGINE_API_KEY';
    case 'qwen':
      return 'DASHSCOPE_API_KEY';
    case 'deepseek':
      return 'DEEPSEEK_API_KEY';
    case 'moonshot':
      return 'MOONSHOT_API_KEY';
    case 'zhipu':
      return 'ZHIPU_API_KEY';
    default:
      return `${providerId.toUpperCase().replaceAll('-', '_')}_API_KEY`;
  }
}
