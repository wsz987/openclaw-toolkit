import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { toast } from 'sonner';
import {
  Cpu,
  Eye,
  EyeOff,
  Lock,
  Copy,
  Check,
  Shield,
  Settings,
  Key,
  Network,
  FolderOpen,
  RefreshCw
} from 'lucide-react';
import type {
  OpenClawPostInstallStatus,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  ProviderCatalogEntry,
  Stage1InstallResult
} from '../model/types';
import { useOpenClawStatusSubscription } from '../model/openclaw-status-store';
import { ProviderBrandIcon } from './provider-brand-icons';

type ProviderSetupPanelProps = {
  result: Stage1InstallResult;
  status: OpenClawPostInstallStatus | null;
  providerSetupLoading: boolean;
  providerSetupResult: OpenClawProviderSetupResult | null;
  runtimeLaunchLoading: boolean;
  statusLoading: boolean;
  onProviderSetup: (input: OpenClawProviderSetupPayload) => Promise<OpenClawProviderSetupResult | null>;
  mode: 'installed' | 'recovery';
  importLoading: boolean;
  onImportInstallation?: () => void;
};

export function ProviderSetupPanel({
  result,
  status,
  providerSetupLoading,
  providerSetupResult,
  runtimeLaunchLoading,
  statusLoading,
  onProviderSetup,
  mode,
  importLoading,
  onImportInstallation
}: ProviderSetupPanelProps) {
  const { status: subscribedStatus, loading: subscribedStatusLoading } = useOpenClawStatusSubscription(result.configPath);
  const resolvedStatus = subscribedStatus ?? status;
  const availableProviders = resolvedStatus?.availableProviders ?? [];
  const fallbackProvider = availableProviders[0] ?? null;

  const [providerId, setProviderId] = useState<string>(fallbackProvider?.id ?? 'volcengine-agent-plan');
  const [apiUrl, setApiUrl] = useState(fallbackProvider?.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/plan/v3');
  const [apiKey, setApiKey] = useState('');
  const [primaryModel, setPrimaryModel] = useState(fallbackProvider?.defaultModel ?? 'volcengine-agent-plan/ark-code-latest');
  const [grantAgentPermissions, setGrantAgentPermissions] = useState(true);
  const [isEditing, setIsEditing] = useState(!(resolvedStatus?.providerInitialized ?? false));
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const providerReady = resolvedStatus?.providerInitialized ?? false;
  const postInstallActionLoading =
    providerSetupLoading || runtimeLaunchLoading || statusLoading || subscribedStatusLoading;

  function describeProviderApi(api: string) {
    return api === 'openai' || api === 'openai-completions' ? 'OpenAI 兼容协议' : api;
  }

  function modelIdForProviderRequest(model: string) {
    const prefix = `${providerId}/`;
    return model.startsWith(prefix) ? model.slice(prefix.length) : model;
  }

  function findProviderById(id: string | null | undefined): ProviderCatalogEntry | null {
    if (!id) {
      return fallbackProvider;
    }

    return (
      availableProviders.find((provider) => provider.id === id || provider.aliases.includes(id)) ??
      fallbackProvider
    );
  }

  function syncProviderFields(
    provider: ProviderCatalogEntry,
    overrides?: {
      apiUrl?: string | null;
      primaryModel?: string | null;
    }
  ) {
    setProviderId(provider.id);
    setApiUrl(overrides?.apiUrl ?? provider.baseUrl);
    setPrimaryModel(overrides?.primaryModel ?? provider.defaultModel);
  }

  function resetFormToCurrentStatus() {
    const resolvedProvider = findProviderById(resolvedStatus?.providerId ?? providerId);
    if (resolvedProvider) {
      syncProviderFields(resolvedProvider, {
        apiUrl: resolvedStatus?.providerApiUrl,
        primaryModel: resolvedStatus?.providerModel
      });
    }

    setApiKey('');
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  }

  useEffect(() => {
    if (!resolvedStatus) {
      return;
    }

    if (providerReady && !isEditing) {
      const resolvedProvider = findProviderById(resolvedStatus.providerId);
      if (resolvedProvider) {
        syncProviderFields(resolvedProvider, {
          apiUrl: resolvedStatus.providerApiUrl,
          primaryModel: resolvedStatus.providerModel
        });
      }
    }
  }, [resolvedStatus, providerReady, isEditing]);

  useEffect(() => {
    setIsEditing(!providerReady);
  }, [providerReady]);

  useEffect(() => {
    if (providerReady && !isEditing) {
      return;
    }

    const resolvedProvider = findProviderById(providerId);
    if (resolvedProvider) {
      setApiUrl(resolvedProvider.baseUrl);
      setPrimaryModel(resolvedProvider.defaultModel);
    }
  }, [providerId, providerReady, isEditing]);

  async function handleTestConnection() {
    if (!apiKey.trim() && !providerReady) {
      toast.warning('请先输入 API Key 再进行连通性测试。');
      return;
    }

    setTestingConnection(true);

    try {
      const usesChatCompletionProbe =
        providerId.includes('volcengine') ||
        providerId.includes('xiaomi') ||
        apiUrl.includes('volces.com') ||
        apiUrl.includes('xiaomimimo.com');
      const testUrl = usesChatCompletionProbe ? `${apiUrl}/chat/completions` : `${apiUrl}/models`;
      const method = usesChatCompletionProbe ? 'POST' : 'GET';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`
      };

      let body: string | undefined;
      if (usesChatCompletionProbe) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          model: modelIdForProviderRequest(primaryModel),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(testUrl, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        toast.success('连接成功！API 终结点与密钥验证通过。');
      } else {
        const errText = await response.text().catch(() => '');
        let detail = `HTTP ${response.status}`;
        try {
          const errJson = JSON.parse(errText);
          detail = errJson?.error?.message || errJson?.message || detail;
        } catch {
          if (errText.trim().substring(0, 100)) {
            detail = `${detail}: ${errText.trim().substring(0, 80)}...`;
          }
        }
        toast.error(`连接测试失败: ${detail}`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error('连接测试超时，请检查您的网络连接或代理设置。');
      } else {
        const isFailedFetch = err instanceof TypeError && err.message.includes('fetch');
        if (isFailedFetch) {
          toast.warning(
            '连接验证受阻。这通常是由于浏览器 CORS 跨域安全限制。此限制不影响主程序运行，您可以直接保存配置后再通过运行控制中心验证。'
          );
        } else {
          toast.error(`连接异常: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      setTestingConnection(false);
    }
  }

  const resolvedProvider = findProviderById(providerId);

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 relative animate-fade-in">
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="flex flex-col gap-6 pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-5">
            <div>
              <h2 className="font-serif text-2xl font-normal tracking-tight text-[hsl(var(--ink))] flex items-center gap-2">
                <Key className="w-5 h-5 text-[hsl(var(--primary))]" />
                API 授权与接入
              </h2>
              <p className="text-xs leading-relaxed text-[hsl(var(--muted))] mt-1.5">
                配置主模型服务商授权参数，用于生成 Agent 工具策略并进行首轮服务就绪联调
              </p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border shadow-2xs ${providerReady
                  ? 'bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.2)]'
                  : 'bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.2)]'
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${providerReady ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--warning))] animate-pulse'}`} />
                {providerReady ? '已接入服务商' : '等待初始化'}
              </span>
            </div>
          </div>

          {!isEditing && providerReady ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] shadow-2xs">
                      <ProviderBrandIcon providerId={resolvedStatus?.providerId ?? providerId} className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">当前服务商</span>
                      <strong className="text-base font-medium text-[hsl(var(--body-strong))] truncate block mt-0.5">
                        {findProviderById(resolvedStatus?.providerId)?.label ?? resolvedStatus?.providerId ?? '未配置'}
                      </strong>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                      <Cpu className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">运行主模型</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))] truncate">
                          {resolvedStatus?.providerModel ?? primaryModel}
                        </strong>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(resolvedStatus?.providerModel ?? primaryModel)}
                          className="text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 rounded hover:bg-[hsl(var(--surface-soft))] transition-all"
                          title="复制模型名称"
                        >
                          {copiedText === (resolvedStatus?.providerModel ?? primaryModel) ? <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
                  <CardContent className="p-5">
                    <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">API 终结点 (Endpoint)</span>
                    <div className="flex items-center justify-between gap-4 mt-1.5 bg-[hsl(var(--canvas))] p-2.5 rounded-lg border border-[hsl(var(--hairline))]">
                      <code className="text-xs font-mono font-medium text-[hsl(var(--body-strong))] break-all select-all">
                        {resolvedStatus?.providerApiUrl ?? apiUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(resolvedStatus?.providerApiUrl ?? apiUrl)}
                        className="text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1.5 rounded hover:bg-[hsl(var(--surface-soft))] transition-all flex-shrink-0"
                        title="复制终结点"
                      >
                        {copiedText === (resolvedStatus?.providerApiUrl ?? apiUrl) ? <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider">授权密钥 (API Key)</span>
                      <strong className="text-sm font-mono tracking-widest text-[hsl(var(--body-strong))] mt-1">
                        ••••••••••••••••••••••••••••••••
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-soft))] bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline-soft))] px-3 py-1.5 rounded-lg shadow-3xs select-none">
                      <Lock className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                      <span>已写入加密配置</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-[hsl(var(--surface-soft))] border-dashed border-[hsl(var(--hairline))]">
                <CardHeader className="p-5 pb-0">
                  <CardTitle className="text-sm font-semibold text-[hsl(var(--body-strong))] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[hsl(var(--primary))]" />
                    已启用系统策略
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 flex flex-col gap-3.5">
                  <div className="flex items-start gap-3">
                    <div className="p-1 rounded-full bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] mt-0.5">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <strong className="text-xs font-semibold text-[hsl(var(--body-strong))] block">OpenClaw Agent 工具权限安全策略</strong>
                      <p className="text-[11px] text-[hsl(var(--muted))] mt-0.5">
                        沙箱运行状态：只读隔离已启用，拒绝修改系统根目录。执行权限受用户会话实时守护。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                  选择模型服务商 (Provider)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {availableProviders.map((provider) => {
                    const isSelected = provider.id === providerId;
                    const isCurrentlyActive = resolvedStatus?.providerId === provider.id;

                    return (
                      <div
                        key={provider.id}
                        onClick={() => setProviderId(provider.id)}
                        className={`group relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col gap-3 select-none ${isSelected
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] shadow-xs'
                          : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] bg-[hsl(var(--canvas))]'
                          }`}
                      >
                        <div className="flex items-start justify-between">
                          <div
                            className={`p-2 rounded-lg transition-transform group-hover:scale-105 border ${isSelected
                              ? 'bg-[hsl(var(--surface-cream-strong))] border-[hsl(var(--primary))/0.25] shadow-2xs'
                              : 'bg-[hsl(var(--canvas))] border-[hsl(var(--hairline))]'
                              }`}
                          >
                            <ProviderBrandIcon providerId={provider.id} className="w-5 h-5" />
                          </div>
                          {isCurrentlyActive && (
                            <span className="text-[9px] font-semibold bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] px-2 py-0.5 rounded-full border border-[hsl(var(--success)/0.2)]">
                              生效中
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-[hsl(var(--ink))]">{provider.label}</h4>
                          <p className="text-[10px] text-[hsl(var(--muted))] mt-1 truncate">
                            {describeProviderApi(provider.api)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-2">
                <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                  配置访问终结点与凭据 (Credentials)
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[hsl(var(--surface-soft))] p-5 rounded-xl border border-[hsl(var(--hairline))]">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center justify-between">
                      <span>API 终结点 (API URL)</span>
                      <span className="text-[10px] text-[hsl(var(--muted))] font-normal">一般采用默认缺省值即可</span>
                    </label>
                    <Input
                      value={apiUrl}
                      onChange={(event) => setApiUrl(event.target.value)}
                      disabled={providerSetupLoading}
                      placeholder="https://..."
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center justify-between">
                      <span>API 密钥 (API Key)</span>
                      {providerReady && (
                        <span className="text-[10px] text-[hsl(var(--warning))] font-normal">留空表示维持上次的配置</span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={providerReady ? '填写新密钥以覆盖配置，如需修改其它项且不改密钥请留空' : '填入您的 API 访问密钥 (Key)'}
                        disabled={providerSetupLoading}
                        className="pr-10 font-mono text-xs tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 transition-colors"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">运行默认模型 (Primary Model)</label>
                    <Input
                      value={primaryModel}
                      onChange={(event) => setPrimaryModel(event.target.value)}
                      disabled={providerSetupLoading}
                      placeholder="模型唯一标识符，例如 deepseek-chat"
                      className="font-mono text-xs"
                    />

                    {resolvedProvider && resolvedProvider.models && resolvedProvider.models.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        <span className="text-[10px] text-[hsl(var(--muted))] font-medium">推荐运行模型点击快速填充：</span>
                        <div className="flex flex-wrap gap-2">
                          {resolvedProvider.models.map((model) => {
                            const formattedModel = model.id.includes('/') ? model.id : `${providerId}/${model.id}`;
                            const isSelected = primaryModel === formattedModel;

                            return (
                              <button
                                type="button"
                                key={model.id}
                                onClick={() => setPrimaryModel(formattedModel)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all duration-150 cursor-pointer ${isSelected
                                  ? 'bg-[hsl(var(--primary)/0.08)] border-[hsl(var(--primary))] text-[hsl(var(--primary))] font-semibold'
                                  : 'bg-[hsl(var(--canvas))] border-[hsl(var(--hairline))] text-[hsl(var(--body))] hover:border-[hsl(var(--muted-soft))] hover:bg-[hsl(var(--surface-soft))]'
                                  }`}
                              >
                                {model.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 mt-2">
                <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">3</span>
                  应用平台安全与通道策略
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[hsl(var(--canvas))] rounded-xl p-2">
                  <label className="group flex items-start gap-3 p-3.5 rounded-lg border border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] cursor-pointer select-none bg-[hsl(var(--canvas))] transition-all">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 rounded border-[hsl(var(--hairline))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))/0.15] bg-[hsl(var(--canvas))] cursor-pointer"
                      checked={grantAgentPermissions}
                      onChange={(event) => setGrantAgentPermissions(event.target.checked)}
                      disabled={providerSetupLoading}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-[hsl(var(--body-strong))] group-hover:text-[hsl(var(--primary))] transition-colors">
                        启用 Agent 安全工具策略
                      </span>
                      <span className="text-[10px] text-[hsl(var(--muted))] leading-normal">
                        系统默认限制工具在当前 workspace 目录下执行，防范任意根目录写操作，保障开发安全。
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {providerSetupResult ? (
                <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] animate-fade-in flex items-start gap-2.5 shadow-2xs">
                  <Check className="text-[hsl(var(--success))] w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>系统环境更新成功：</strong>
                    <span>服务商配置已安全写入，绑定运行模型为 `{providerSetupResult.primaryModel}`。</span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex-none pt-4 border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] mt-2 z-10 relative shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        {!isEditing && providerReady ? (
          <Button
            variant="secondary"
            onClick={() => {
              resetFormToCurrentStatus();
              setIsEditing(true);
            }}
            disabled={postInstallActionLoading}
            className="w-full h-11 hover:bg-[hsl(var(--surface-cream-strong))] border-[hsl(var(--hairline))] cursor-pointer font-medium"
          >
            <Settings className="w-4 h-4 mr-2" />
            修改授权配置
          </Button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button
              type="button"
              variant="secondary"
              disabled={postInstallActionLoading || testingConnection}
              onClick={handleTestConnection}
              className="h-10 px-4 hover:bg-[hsl(var(--surface-cream-strong))] text-[hsl(var(--body))] font-medium cursor-pointer"
            >
              {testingConnection ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  正在连接测试中...
                </>
              ) : (
                <>
                  <Network className="w-4 h-4 mr-2 text-[hsl(var(--primary))]" />
                  测试端点连接
                </>
              )}
            </Button>

            <div className="flex gap-3 flex-1 sm:flex-initial sm:justify-end">
              {providerReady && (
                <Button
                  variant="secondary"
                  disabled={postInstallActionLoading}
                  onClick={() => {
                    resetFormToCurrentStatus();
                    setIsEditing(false);
                  }}
                  className="hover:bg-[hsl(var(--surface-soft))] h-10 px-5 cursor-pointer font-medium"
                >
                  取消
                </Button>
              )}

              {mode === 'recovery' && onImportInstallation ? (
                <Button
                  variant="secondary"
                  disabled={importLoading}
                  onClick={onImportInstallation}
                  className="hover:bg-[hsl(var(--surface-soft))] h-10 px-4 cursor-pointer font-medium"
                >
                  {importLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      正在导入环境...
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      重新导入已安装环境
                    </>
                  )}
                </Button>
              ) : null}

              <Button
                variant="default"
                disabled={postInstallActionLoading || !resolvedStatus || (!apiKey.trim() && !providerReady)}
                onClick={() =>
                  void onProviderSetup({
                    configPath: result.configPath,
                    providerId,
                    apiKey,
                    apiUrl,
                    primaryModel,
                    grantAgentPermissions
                  })
                }
                className="flex-1 sm:flex-none min-w-[140px] h-10 bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))] cursor-pointer font-medium shadow-sm"
              >
                {providerSetupLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    正在保存并写入...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    保存并初始化
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
