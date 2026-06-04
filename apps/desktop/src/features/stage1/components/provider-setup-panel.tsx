import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../components/ui/card';
import { 
  Flame, Compass, Sparkles, Cpu, Eye, EyeOff, Lock, Copy, Check,
  Activity, Shield, ExternalLink, HelpCircle, ArrowRight, Settings, Info, AlertTriangle, Key, Network,
  FolderOpen, RefreshCw
} from 'lucide-react';
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
  const [grantAgentPermissions, setGrantAgentPermissions] = useState(true);

  const providerReady = status?.providerInitialized ?? false;
  const [isEditing, setIsEditing] = useState(!providerReady);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Connection testing states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  function findProviderById(id: string | null | undefined): ProviderCatalogEntry | null {
    if (!id) {
      return fallbackProvider;
    }

    return (
      availableProviders.find((provider) => provider.id === id || provider.aliases.includes(id)) ??
      fallbackProvider
    );
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

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
  }, [status, availableProviders, fallbackProvider]);

  useEffect(() => {
    setIsEditing(!providerReady);
  }, [providerReady]);

  useEffect(() => {
    // Only update values in edit mode when providerId changes manually
    if (!providerReady || isEditing) {
      const resolvedProvider = findProviderById(providerId);
      if (resolvedProvider) {
        setApiUrl(resolvedProvider.baseUrl);
        setPrimaryModel(resolvedProvider.defaultModel);
      }
    }
    // Clear test result when provider changes
    setTestResult(null);
  }, [providerId, providerReady, isEditing, availableProviders, fallbackProvider]);

  const postInstallActionLoading = providerSetupLoading || runtimeLaunchLoading || statusLoading;

  const handleTestConnection = async () => {
    if (!apiKey.trim() && !providerReady) {
      setTestResult({ success: false, message: '请先输入 API Key 再进行连通性测试。' });
      return;
    }
    
    setTestingConnection(true);
    setTestResult(null);
    
    try {
      const isVolc = providerId.includes('volcengine') || apiUrl.includes('volces.com');
      // For volcanic engine or other chat/completions endpoints, models endpoint is safer for testing to prevent actual generation billing
      const testUrl = isVolc 
        ? `${apiUrl}/chat/completions` 
        : `${apiUrl}/models`;
        
      const method = isVolc ? 'POST' : 'GET';
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
      };
      
      let body = undefined;
      if (isVolc) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          model: primaryModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        });
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
      
      const response = await fetch(testUrl, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        setTestResult({ success: true, message: '连接成功！API 终结点与密钥验证通过。' });
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
        setTestResult({ success: false, message: `连接测试失败: ${detail}` });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setTestResult({ success: false, message: '连接测试超时，请检查您的网络连接或代理设置。' });
      } else {
        const isFailedFetch = err instanceof TypeError && err.message.includes('fetch');
        if (isFailedFetch) {
          setTestResult({ 
            success: false, 
            message: '连接验证受阻。这通常是由于浏览器 CORS 跨域安全限制（服务商 API 未允许桌面沙箱直接调用）。此安全限制不影响主程序运行。您可以直接保存配置，并在启动服务后通过系统运行控制中心测试。' 
          });
        } else {
          setTestResult({ success: false, message: `连接异常: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const resolvedProvider = findProviderById(providerId);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Visual Header */}
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
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide border shadow-2xs ${
              providerReady
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
        // Read-only State Summary Card (Polished Premium Layout)
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Provider Card */}
            <Card className="hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                  <Flame className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">当前服务商</span>
                  <strong className="text-base font-medium text-[hsl(var(--body-strong))] truncate block mt-0.5">
                    {findProviderById(status?.providerId)?.label ?? status?.providerId ?? '未配置'}
                  </strong>
                </div>
              </CardContent>
            </Card>

            {/* Model Card */}
            <Card className="hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <Cpu className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">运行主模型</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <strong className="text-sm font-mono font-medium text-[hsl(var(--body-strong))] truncate">
                      {status?.providerModel ?? primaryModel}
                    </strong>
                    <button 
                      onClick={() => copyToClipboard(status?.providerModel ?? primaryModel)}
                      className="text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1 rounded hover:bg-[hsl(var(--surface-soft))] transition-all"
                      title="复制模型名称"
                    >
                      {copiedText === (status?.providerModel ?? primaryModel) ? <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* End Point Card */}
            <Card className="md:col-span-2 hover:border-[hsl(var(--muted-soft))/0.5] transition-all duration-300">
              <CardContent className="p-5">
                <span className="text-[10px] font-bold text-[hsl(var(--muted))] uppercase tracking-wider block">API 终结点 (Endpoint)</span>
                <div className="flex items-center justify-between gap-4 mt-1.5 bg-[hsl(var(--canvas))] p-2.5 rounded-lg border border-[hsl(var(--hairline))]">
                  <code className="text-xs font-mono font-medium text-[hsl(var(--body-strong))] break-all select-all">
                    {status?.providerApiUrl ?? apiUrl}
                  </code>
                  <button 
                    onClick={() => copyToClipboard(status?.providerApiUrl ?? apiUrl)}
                    className="text-[hsl(var(--muted-soft))] hover:text-[hsl(var(--ink))] cursor-pointer p-1.5 rounded hover:bg-[hsl(var(--surface-soft))] transition-all flex-shrink-0"
                    title="复制终结点"
                  >
                    {copiedText === (status?.providerApiUrl ?? apiUrl) ? <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Encrypted Key Card */}
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

          {/* Active Policies Panel */}
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

          {/* Edit Trigger */}
          <div className="flex mt-2">
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              disabled={postInstallActionLoading}
              className="w-full h-11 hover:bg-[hsl(var(--surface-cream-strong))] border-[hsl(var(--hairline))] cursor-pointer font-medium"
            >
              <Settings className="w-4 h-4 mr-2" />
              修改授权配置
            </Button>
          </div>
        </div>
      ) : (
        // Edit Mode Form (Beautiful and Interactive)
        <div className="flex flex-col gap-6 animate-fade-in">
          
          {/* Step 1: Provider Selection Grid */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">1</span>
              选择模型服务商 (Provider)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {availableProviders.map((provider) => {
                const isSelected = provider.id === providerId;
                const isCurrentlyActive = status?.providerId === provider.id;
                
                let iconBg = "bg-[hsl(var(--canvas))] text-[hsl(var(--ink))]";
                let providerIcon = <Cpu className="w-5 h-5" />;
                
                if (provider.id.includes('volcengine') || provider.id.includes('ark')) {
                  iconBg = isSelected ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300";
                  providerIcon = <Flame className="w-5 h-5" />;
                } else if (provider.id.includes('deepseek')) {
                  iconBg = isSelected ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300";
                  providerIcon = <Compass className="w-5 h-5" />;
                } else if (provider.id.includes('openai')) {
                  iconBg = isSelected ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300";
                  providerIcon = <Sparkles className="w-5 h-5" />;
                }
                
                return (
                  <div
                    key={provider.id}
                    onClick={() => setProviderId(provider.id)}
                    className={`group relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer flex flex-col gap-3 select-none ${
                      isSelected 
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] shadow-xs' 
                        : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] bg-[hsl(var(--canvas))]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-lg transition-transform group-hover:scale-105 ${iconBg}`}>
                        {providerIcon}
                      </div>
                      {isCurrentlyActive && (
                        <span className="text-[9px] font-semibold bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] px-2 py-0.5 rounded-full border border-[hsl(var(--success)/0.2)]">
                          生效中
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[hsl(var(--ink))]">
                        {provider.label}
                      </h4>
                      <p className="text-[10px] text-[hsl(var(--muted))] mt-1 truncate">
                        {provider.api === 'openai' ? 'OpenAI 兼容协议' : provider.api}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: Form Inputs (API configuration) */}
          <div className="flex flex-col gap-4 mt-2">
            <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">2</span>
              配置访问终结点与凭据 (Credentials)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[hsl(var(--surface-soft))] p-5 rounded-xl border border-[hsl(var(--hairline))]">
              {/* Endpoint Input */}
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

              {/* API Key Input */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-[hsl(var(--body-strong))] flex items-center justify-between">
                  <span>API 密钥 (API Key)</span>
                  {providerReady && (
                    <span className="text-[10px] text-[hsl(var(--warning))] font-normal">留空表示维持上次的配置</span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={providerReady ? "填写新密钥以覆盖配置，如需修改其它项且不改密钥请留空" : "填入您的 API 访问密钥 (Key)"}
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

              {/* Model Input */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-[hsl(var(--body-strong))]">运行默认模型 (Primary Model)</label>
                <Input
                  value={primaryModel}
                  onChange={(event) => setPrimaryModel(event.target.value)}
                  disabled={providerSetupLoading}
                  placeholder="模型唯一标识符，例如 deepseek-chat"
                  className="font-mono text-xs"
                />
                
                {/* Model Recommendation Chips */}
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
                            className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all duration-150 cursor-pointer ${
                              isSelected 
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

          {/* Step 3: Policies (Checkboxes) */}
          <div className="flex flex-col gap-2.5 mt-2">
            <label className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[hsl(var(--primary))] text-white text-[10px] flex items-center justify-center font-bold">3</span>
              应用平台安全与通道策略
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))] rounded-xl p-5">
              {/* Agent policy checkbox card */}
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

          {/* Connection Test feedback */}
          {testResult && (
            <div 
              className={`rounded-lg border px-4 py-3 text-xs leading-relaxed animate-fade-in flex items-start gap-2.5 ${
                testResult.success
                  ? 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] text-[hsl(var(--body-strong))]'
                  : 'border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--body-strong))]'
              }`}
            >
              {testResult.success ? (
                <Check className="text-[hsl(var(--success))] w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="text-[hsl(var(--warning))] w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <strong>{testResult.success ? '测试通过' : '测试提示'}：</strong>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-2 pt-4 border-t border-[hsl(var(--hairline))]">
            
            {/* Left aligned tester */}
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

            {/* Right aligned actions */}
            <div className="flex gap-3 flex-1 sm:flex-initial sm:justify-end">
              {providerReady && (
                <Button
                  variant="secondary"
                  disabled={postInstallActionLoading}
                  onClick={() => {
                    setIsEditing(false);
                    setTestResult(null);
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
                disabled={postInstallActionLoading || !status || (!apiKey.trim() && !providerReady)}
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
        </div>
      )}

      {/* Success Setup feedback */}
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
  );
}
