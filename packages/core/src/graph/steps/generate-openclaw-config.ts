import fs from 'fs-extra';
import type { ProviderCatalogEntry } from '@openclaw-toolkit/schemas';
import type { WorkflowStep } from '../types.js';

const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_GATEWAY_BIND = 'loopback';
const DEFAULT_GATEWAY_MODE = 'local';
const DEFAULT_BROWSER_PLUGIN_ID = 'browser';
const DEFAULT_FEISHU_PLUGIN_ID = 'feishu';
const DEFAULT_OPENAI_PROVIDER_API = 'openai-completions';
const DEFAULT_AGENT_SKILLS = ['browser-control', 'local-filesystem'];

export const generateOpenClawConfigStep: WorkflowStep = {
  id: 'generateOpenClawConfig',
  title: '生成 openclaw.json',
  description: '根据授权、版本和权限模板生成 OpenClaw 配置',
  async run(ctx) {
    await fs.ensureDir(ctx.runtimeDir);
    const workspaceDir = `${ctx.runtimeDir}\\workspace`;
    const releaseSkills = (ctx.artifact?.skills ?? [])
      .map((skill) => skill.name.trim())
      .filter((skill) => skill.length > 0);
    const defaultSkills = releaseSkills.length > 0 ? releaseSkills : DEFAULT_AGENT_SKILLS;
    const providerCatalog: ProviderCatalogEntry[] =
      ctx.providerCatalog?.providers?.length ? ctx.providerCatalog.providers : [fallbackProvider()];
    const providers = providerCatalog
      .reduce<Record<string, unknown>>((acc, provider: ProviderCatalogEntry) => {
        const apiKeyEnv = provider.apiKeyEnv ?? inferApiKeyEnv(provider.id);
        acc[provider.id] = {
          api: provider.api || DEFAULT_OPENAI_PROVIDER_API,
          baseUrl: provider.baseUrl,
          apiKey: `\${${apiKeyEnv}}`,
          models: provider.models.map((model: ProviderCatalogEntry['models'][number]) => ({
            id: model.id,
            name: model.name,
            input: model.input ?? [],
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens
          }))
        };
        return acc;
      }, {});
    const defaultProvider = providerCatalog[0] ?? fallbackProvider();
    const defaultAgentModels = providerCatalog
      .flatMap((provider: ProviderCatalogEntry) =>
        provider.models.map((model: ProviderCatalogEntry['models'][number]) => [`${provider.id}/${model.id}`, {}] as const)
      );

    await fs.writeJson(ctx.configPath, {
      version: 1,
      gateway: {
        mode: DEFAULT_GATEWAY_MODE,
        bind: DEFAULT_GATEWAY_BIND,
        port: DEFAULT_GATEWAY_PORT,
        auth: {
          mode: 'none'
        },
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
          skills: defaultSkills,
          heartbeat: {
            every: '0m'
          },
          sandbox: {
            mode: 'off'
          }
        }
      },
      tools: {
        profile: 'coding',
        deny: ['browser', 'canvas'],
        fs: {
          workspaceOnly: true
        },
        exec: {
          security: 'full',
          ask: 'off',
          applyPatch: {
            workspaceOnly: true
          }
        }
      },
      models: {
        mode: 'merge',
        providers
      },
      skills: {
        load: {
          extraDirs: [`${ctx.runtimeDir}\\skills`]
        }
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
