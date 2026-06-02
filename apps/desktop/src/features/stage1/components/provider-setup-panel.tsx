import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { CheckIcon, FolderIcon, SettingsIcon, SpinnerIcon } from '../../../components/icons';
import type {
  OpenClawPostInstallStatus,
  ProviderCatalogEntry,
  OpenClawProviderSetupPayload,
  OpenClawProviderSetupResult,
  Stage1InstallResult
} from '../model/types';

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
  const availableProviders = status?.availableProviders ?? [];
  const fallbackProvider = availableProviders[0] ?? null;
  const [providerId, setProviderId] = useState<string>(fallbackProvider?.id ?? 'volcengine-agent-plan');
  const [apiUrl, setApiUrl] = useState(fallbackProvider?.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/plan/v3');
  const [apiKey, setApiKey] = useState('');
  const [primaryModel, setPrimaryModel] = useState(fallbackProvider?.defaultModel ?? 'volcengine-agent-plan/ark-code-latest');
  const [enableFeishuPlugin, setEnableFeishuPlugin] = useState(true);
  const [grantAgentPermissions, setGrantAgentPermissions] = useState(true);

  const providerReady = status?.providerInitialized ?? false;
  const [isEditing, setIsEditing] = useState(!providerReady);

  function findProviderById(id: string | null | undefined): ProviderCatalogEntry | null {
    if (!id) {
      return fallbackProvider;
    }

    return (
      availableProviders.find((provider) => provider.id === id || provider.aliases.includes(id)) ??
      fallbackProvider
    );
  }

  useEffect(() => {
    if (!status) {
      return;
    }

    const resolvedProvider = findProviderById(status.providerId);
    if (resolvedProvider) {
      setProviderId(resolvedProvider.id);
      setApiUrl(status.providerApiUrl ?? resolvedProvider.baseUrl);
      setPrimaryModel(status.providerModel ?? resolvedProvider.defaultModel);
    }

    setEnableFeishuPlugin(!status.feishuPluginEnabled ? true : status.feishuPluginEnabled);
  }, [status, availableProviders, fallbackProvider]);

  useEffect(() => {
    setIsEditing(!providerReady);
  }, [providerReady]);

  useEffect(() => {
    // Only update values in edit mode when providerType changes manually
    if (!providerReady || isEditing) {
      const resolvedProvider = findProviderById(providerId);
      if (resolvedProvider) {
        setApiUrl(resolvedProvider.baseUrl);
        setPrimaryModel(resolvedProvider.defaultModel);
      }
    }
  }, [providerId, providerReady, isEditing, availableProviders, fallbackProvider]);

  const postInstallActionLoading = providerSetupLoading || runtimeLaunchLoading || statusLoading;

  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-6 flex flex-col gap-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-4">
        <div>
          <h3 className="font-serif text-xl font-normal tracking-tight text-[hsl(var(--ink))]">API 授权与接入</h3>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted))] mt-1">
            配置服务商 Provider、密钥模型并应用 Agent 工具策略
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
            providerReady
              ? 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]'
              : 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]'
          }`}
        >
          {providerReady ? '已接入服务商' : '等待接入'}
        </span>
      </div>

      {!isEditing && providerReady ? (
        // Read-only State Summary Card
        <div className="flex flex-col gap-5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline-soft))] p-3.5 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">Provider 服务商</span>
              <strong className="text-sm font-medium text-[hsl(var(--body-strong))]">
                {findProviderById(status?.providerId)?.label ?? status?.providerId ?? '未配置'}
              </strong>
            </div>

            <div className="bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline-soft))] p-3.5 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">默认模型</span>
              <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))] truncate">
                {status?.providerModel ?? primaryModel}
              </strong>
            </div>

            <div className="bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline-soft))] p-3.5 rounded-lg flex flex-col gap-1 md:col-span-2">
              <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">API URL 终结点</span>
              <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))] break-all">
                {status?.providerApiUrl ?? apiUrl}
              </strong>
            </div>

            <div className="bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline-soft))] p-3.5 rounded-lg flex flex-col gap-1 md:col-span-2">
              <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">API 秘钥 (Key)</span>
              <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))]">
                ••••••••••••••••••••••••••••••••
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[hsl(var(--hairline-soft))] pt-4">
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--body))]">
              <CheckIcon size={14} className="text-[hsl(var(--success))]" />
              <span>飞书插件入口：{status?.feishuPluginEnabled ? '已启用' : '已禁用'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--body))]">
              <CheckIcon size={14} className="text-[hsl(var(--success))]" />
              <span>OpenClaw Agent 工具策略已启用</span>
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              disabled={postInstallActionLoading}
              className="w-full h-10 hover:bg-[hsl(var(--surface-soft))]"
            >
              <SettingsIcon size={14} className="mr-2" />
              修改授权配置
            </Button>
          </div>
        </div>
      ) : (
        // Edit Mode Form
        <div className="flex flex-col gap-5 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Provider 类型</label>
              <Select
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                disabled={providerSetupLoading}
              >
                {availableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">默认模型</label>
              <Input
                value={primaryModel}
                onChange={(event) => setPrimaryModel(event.target.value)}
                disabled={providerSetupLoading}
                placeholder="模型标识符"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">API URL</label>
              <Input
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                disabled={providerSetupLoading}
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={providerReady ? "填写新 Key 以覆盖 (隐藏已有 Key)" : "填写服务商 API Key"}
                disabled={providerSetupLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] rounded-lg p-4">
            <label className="flex items-center gap-2.5 text-xs text-[hsl(var(--body))] cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-[hsl(var(--hairline))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))/0.15] bg-[hsl(var(--canvas))] cursor-pointer transition-all"
                checked={enableFeishuPlugin}
                onChange={(event) => setEnableFeishuPlugin(event.target.checked)}
                disabled={providerSetupLoading}
              />
              启用飞书插件入口
            </label>
            <label className="flex items-center gap-2.5 text-xs text-[hsl(var(--body))] cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-[hsl(var(--hairline))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))/0.15] bg-[hsl(var(--canvas))] cursor-pointer transition-all"
                checked={grantAgentPermissions}
                onChange={(event) => setGrantAgentPermissions(event.target.checked)}
                disabled={providerSetupLoading}
              />
              启用 OpenClaw Agent 工具策略
            </label>
          </div>

          <div className="flex flex-wrap gap-3 mt-2">
            <Button
              variant="default"
              disabled={postInstallActionLoading || !status || apiKey.trim().length === 0}
              onClick={() =>
                void onProviderSetup({
                  configPath: result.configPath,
                  providerId,
                  apiKey,
                  apiUrl,
                  primaryModel,
                  enableFeishuPlugin,
                  grantAgentPermissions
                })
              }
              className="flex-1 min-w-[140px] bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))]"
            >
              {providerSetupLoading ? (
                <>
                  <SpinnerIcon size={14} className="spinning mr-2" />
                  正在保存配置...
                </>
              ) : (
                <>
                  <CheckIcon size={14} className="mr-2" />
                  保存并初始化
                </>
              )}
            </Button>

            {providerReady && (
              <Button
                variant="secondary"
                disabled={postInstallActionLoading}
                onClick={() => setIsEditing(false)}
                className="hover:bg-[hsl(var(--surface-soft))]"
              >
                取消
              </Button>
            )}

            {mode === 'recovery' && onImportInstallation ? (
              <Button
                variant="secondary"
                disabled={importLoading}
                onClick={onImportInstallation}
                className="hover:bg-[hsl(var(--surface-soft))]"
              >
                {importLoading ? (
                  <>
                    <SpinnerIcon size={14} className="spinning mr-2" />
                    正在导入...
                  </>
                ) : (
                  <>
                    <FolderIcon size={14} className="mr-2" />
                    重新导入已安装环境
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {providerSetupResult ? (
        <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))] animate-fade-in flex items-start gap-2.5">
          <CheckIcon size={14} className="text-[hsl(var(--success))] mt-0.5 flex-shrink-0" />
          <div>
            <strong>配置保存成功：</strong>
            <span>服务商 `{providerSetupResult.providerId}` 已写入，模型 `{providerSetupResult.primaryModel}` 已绑定。</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
