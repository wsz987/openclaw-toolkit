import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { CheckIcon, FolderIcon, SettingsIcon, SpinnerIcon } from '../../../components/icons';
import type {
  OpenClawPostInstallStatus,
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
  const [providerId, setProviderId] = useState<'volcengine' | 'volcengine-plan'>('volcengine-plan');
  const [apiUrl, setApiUrl] = useState('https://ark.cn-beijing.volces.com/api/coding/v3');
  const [apiKey, setApiKey] = useState('');
  const [primaryModel, setPrimaryModel] = useState('volcengine-plan/ark-code-latest');
  const [enableFeishuPlugin, setEnableFeishuPlugin] = useState(true);
  const [grantAgentPermissions, setGrantAgentPermissions] = useState(true);

  useEffect(() => {
    if (!status) {
      return;
    }

    if (status.providerId === 'volcengine') {
      setProviderId('volcengine');
      setApiUrl(status.providerApiUrl ?? 'https://ark.cn-beijing.volces.com/api/v3');
      setPrimaryModel(status.providerModel ?? 'volcengine/doubao-seed-1-8-251228');
    } else {
      setProviderId('volcengine-plan');
      setApiUrl(status.providerApiUrl ?? 'https://ark.cn-beijing.volces.com/api/coding/v3');
      setPrimaryModel(status.providerModel ?? 'volcengine-plan/ark-code-latest');
    }

    setEnableFeishuPlugin(!status.feishuPluginEnabled ? true : status.feishuPluginEnabled);
  }, [status]);

  useEffect(() => {
    if (providerId === 'volcengine') {
      setApiUrl('https://ark.cn-beijing.volces.com/api/v3');
      setPrimaryModel('volcengine/doubao-seed-1-8-251228');
    } else {
      setApiUrl('https://ark.cn-beijing.volces.com/api/coding/v3');
      setPrimaryModel('volcengine-plan/ark-code-latest');
    }
  }, [providerId]);

  const providerReady = status?.providerInitialized ?? false;
  const postInstallActionLoading = providerSetupLoading || runtimeLaunchLoading || statusLoading;

  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[hsl(var(--ink))]">OpenClaw 初始化与授权</h3>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted))] mt-1">
            先接入 Provider，再开放 Agent 权限，并按需要启用飞书插件入口。
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
            providerReady
              ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
              : 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
          }`}
        >
          {providerReady ? 'Provider 已初始化' : '待初始化'}
        </span>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${providerReady ? 'opacity-70' : ''}`}>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">Provider 类型</label>
          <select
            className="h-10 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-3 text-sm text-[hsl(var(--ink))]"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value as 'volcengine' | 'volcengine-plan')}
            disabled={providerSetupLoading || providerReady}
          >
            <option value="volcengine-plan">火山引擎 Ark Coding</option>
            <option value="volcengine">火山引擎 Ark 通用模型</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">默认模型</label>
          <Input
            value={primaryModel}
            onChange={(event) => setPrimaryModel(event.target.value)}
            disabled={providerSetupLoading || providerReady}
          />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">API URL</label>
          <Input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} disabled={providerSetupLoading || providerReady} />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">API Key</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="填写火山引擎 API Key"
            disabled={providerSetupLoading || providerReady}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--body))]">
          <input
            type="checkbox"
            checked={enableFeishuPlugin}
            onChange={(event) => setEnableFeishuPlugin(event.target.checked)}
            disabled={providerSetupLoading || providerReady}
          />
          启用飞书插件入口
        </label>
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--body))]">
          <input
            type="checkbox"
            checked={grantAgentPermissions}
            onChange={(event) => setGrantAgentPermissions(event.target.checked)}
            disabled={providerSetupLoading || providerReady}
          />
          授权 OpenClaw Agent 权限
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="default"
          disabled={postInstallActionLoading || !status || providerReady || apiKey.trim().length === 0}
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
        >
          {providerSetupLoading ? (
            <>
              <SpinnerIcon size={14} className="spinning mr-2" />
              正在初始化
            </>
          ) : providerReady ? (
            <>
              <CheckIcon size={14} className="mr-2" />
              初始化已完成
            </>
          ) : (
            <>
              <SettingsIcon size={14} className="mr-2" />
              初始化 OpenClaw
            </>
          )}
        </Button>
        {mode === 'recovery' && onImportInstallation ? (
          <Button variant="secondary" disabled={importLoading} onClick={onImportInstallation}>
            {importLoading ? (
              <>
                <SpinnerIcon size={14} className="spinning mr-2" />
                导入中
              </>
            ) : (
              <>
                <FolderIcon size={14} className="mr-2" />
                重新导入已有安装
              </>
            )}
          </Button>
        ) : null}
      </div>

      {providerSetupResult ? (
        <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
          Provider 已写入：`{providerSetupResult.providerId}`，默认模型：`{providerSetupResult.primaryModel}`，
          飞书插件 {providerSetupResult.feishuPluginEnabled ? '已启用' : '未启用'}。
        </div>
      ) : null}

      {providerReady ? (
        <div className="rounded-lg border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
          初始化已完成。你现在可以继续启动 OpenClaw、打开控制面板，或进行后续运行操作。
        </div>
      ) : null}
    </div>
  );
}
