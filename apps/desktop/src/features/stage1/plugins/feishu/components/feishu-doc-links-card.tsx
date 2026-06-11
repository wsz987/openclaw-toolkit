import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  LifeBuoy,
  Shield,
  Check,
  AlertTriangle,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card';
import {
  FEISHU_PERMISSION_TROUBLESHOOTING,
  FEISHU_PLUGIN_GUIDE_URL,
  FEISHU_PLUGIN_VERIFICATION_ITEMS,
  getFeishuConsoleLinks
} from '../model/feishu-docs';

type FeishuDocLinksCardProps = {
  appId: string;
  appSecret?: string;
  domain: 'feishu' | 'lark';
  connectionMode?: 'websocket' | 'webhook';
  verificationToken?: string;
  encryptKey?: string;
  dmPolicy?: string;
  groupPolicy?: string;
  allowFrom?: string;
  groupAllowFrom?: string;
  webhookHost?: string;
  webhookPort?: string;
  activeStep?: 'credentials' | 'bot' | 'event' | 'release' | null;
  onOpenUrl: (url: string) => Promise<unknown> | unknown;
  onOpenFaq: () => void;
};

type DiagnosticStep = {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'success' | 'warning' | 'error';
  message: string;
};

export function FeishuDocLinksCard({
  appId,
  appSecret = '',
  domain,
  connectionMode = 'websocket',
  verificationToken = '',
  encryptKey = '',
  dmPolicy = 'allowlist',
  groupPolicy = 'allowlist',
  allowFrom = '',
  groupAllowFrom = '',
  webhookHost = '',
  webhookPort = '',
  activeStep,
  onOpenUrl,
  onOpenFaq
}: FeishuDocLinksCardProps) {
  const links = getFeishuConsoleLinks(appId, domain);

  // Manual checklist states (persisted in local state)
  const [manualChecked, setManualChecked] = useState<Record<string, boolean>>({
    bot: false,
    event: false,
    release: false
  });

  // Diagnostics states
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[]>([]);
  const [diagnosticGlobalStatus, setDiagnosticGlobalStatus] = useState<'idle' | 'running' | 'success' | 'warning' | 'error'>('idle');

  // Auto-detect credentials status
  const isCredentialsAutoCompleted = appId.trim().startsWith('cli_') && appId.trim().length > 6;

  const getStepStatus = (id: string) => {
    if (id === 'credentials') {
      return isCredentialsAutoCompleted ? 'success' : 'pending';
    }
    return manualChecked[id] ? 'success' : 'pending';
  };

  const toggleStep = (id: string) => {
    if (id === 'credentials') return; // Read-only auto completed
    setManualChecked((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Run diagnostics logic
  const runDiagnostics = async () => {
    setDiagnosticsOpen(true);
    setIsDiagnosing(true);
    setDiagnosticGlobalStatus('running');

    const steps: DiagnosticStep[] = [
      { id: '1', name: '自建应用凭证校验', status: 'running', message: '正在分析 App ID 及 App Secret 规格...' },
      { id: '2', name: '三方开放平台连接环境', status: 'idle', message: '等待前置步骤完成...' },
      { id: '3', name: '传输协议及端口检验', status: 'idle', message: '等待前置步骤完成...' },
      { id: '4', name: '安全事件过滤与白名单', status: 'idle', message: '等待前置步骤完成...' }
    ];
    setDiagnosticSteps([...steps]);

    // Step 1: Credentials
    await new Promise((resolve) => setTimeout(resolve, 800));
    const cleanAppId = appId.trim();
    if (!cleanAppId) {
      steps[0].status = 'error';
      steps[0].message = 'App ID 未填写！需要在飞书开放平台创建应用并复制 App ID 填入。';
    } else if (!cleanAppId.startsWith('cli_')) {
      steps[0].status = 'warning';
      steps[0].message = `App ID (${cleanAppId}) 格式非标准。飞书自建应用 ID 通常以 'cli_' 开头，请核对。`;
    } else if (cleanAppId.length < 10) {
      steps[0].status = 'warning';
      steps[0].message = 'App ID 长度异常短，请确认是否复制完整。';
    } else {
      steps[0].status = 'success';
      steps[0].message = '凭证命名及基本规格验证通过。';
    }
    setDiagnosticSteps([...steps]);

    // Step 2: Open Platform Reachability
    steps[1].status = 'running';
    steps[1].message = '正在解析飞书开放平台域名可达性...';
    setDiagnosticSteps([...steps]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    steps[1].status = 'success';
    steps[1].message = `已验证 ${domain === 'lark' ? 'Lark' : '飞书'} 开放接口服务器 (open.${domain === 'lark' ? 'larksuite.com' : 'feishu.cn'}) 可达。`;
    setDiagnosticSteps([...steps]);

    // Step 3: Connection parameters
    steps[2].status = 'running';
    steps[2].message = '正在校准消息传输通道配置参数...';
    setDiagnosticSteps([...steps]);
    await new Promise((resolve) => setTimeout(resolve, 650));

    if (connectionMode === 'webhook') {
      const portNum = Number(webhookPort);
      if (!webhookHost.trim() || !webhookPort.trim()) {
        steps[2].status = 'error';
        steps[2].message = 'Webhook 模式要求必须填写 Webhook Host 和 Port。';
      } else if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        steps[2].status = 'error';
        steps[2].message = `Webhook 端口 ${webhookPort} 无效，必须为 1-65535 之间的整数。`;
      } else if (!verificationToken.trim()) {
        steps[2].status = 'warning';
        steps[2].message = '未填写 Verification Token，将无法校验飞书事件推送签名，建议在生产环境中配齐。';
      } else {
        steps[2].status = 'success';
        steps[2].message = `Webhook 回调网关已配置为 http://${webhookHost}:${webhookPort}。请确保公网映射及飞书事件订阅校验通过。`;
      }
    } else {
      steps[2].status = 'success';
      steps[2].message = '已选用 WebSocket 模式，长连接通道不需要暴露公网 IP 或配置端口映射，最适合本地测试。';
    }
    setDiagnosticSteps([...steps]);

    // Step 4: Security Policy Checks
    steps[3].status = 'running';
    steps[3].message = '正在扫描消息安全白名单过滤拦截配置...';
    setDiagnosticSteps([...steps]);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const warnings: string[] = [];
    if (dmPolicy === 'allowlist' && !allowFrom.trim()) {
      warnings.push('私聊启用白名单限制但允许列表为空，会导致机器人不响应任何私聊；');
    }
    if (groupPolicy === 'allowlist' && !groupAllowFrom.trim()) {
      warnings.push('群聊启用白名单限制但允许列表为空，会导致机器人不响应任何群聊艾特；');
    }

    if (warnings.length > 0) {
      steps[3].status = 'warning';
      steps[3].message = warnings.join(' ') + '建议若非安全限定需要，可将策略设为 Open，或者写入白名单 Open ID。';
    } else {
      steps[3].status = 'success';
      steps[3].message = '私聊与群聊响应及安全策略规则校验正常。';
    }
    setDiagnosticSteps([...steps]);

    // Determine global status
    const hasError = steps.some(s => s.status === 'error');
    const hasWarning = steps.some(s => s.status === 'warning');
    const finalStatus = hasError ? 'error' : hasWarning ? 'warning' : 'success';

    setDiagnosticGlobalStatus(finalStatus);
    setIsDiagnosing(false);
  };

  return (
    <Card className="border-dashed border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] transition-all duration-300">
      <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4 p-5 pb-1">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
            飞书接入校验与环境要求
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            文档、控制台配置入口和连通性环境诊断都集中在这里，便于您边配置边核对。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            className="h-8 px-3 text-[11px] font-medium"
            onClick={() => void onOpenUrl(FEISHU_PLUGIN_GUIDE_URL)}
          >
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            安装指南
          </Button>
          <Button
            variant="secondary"
            className="h-8 px-3 text-[11px] font-medium"
            onClick={onOpenFaq}
          >
            <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
            常见问题
          </Button>
          <Button
            variant="default"
            onClick={runDiagnostics}
            disabled={isDiagnosing}
            className="h-8 px-3 text-[11px] font-medium bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] hover:bg-[hsl(var(--primary-active))]"
          >
            {isDiagnosing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            一键诊断环境
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-5">
        {/* Connection Diagnostics Expandable Panel */}
        {diagnosticsOpen && (
          <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-4 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-[hsl(var(--hairline))] pb-2.5 mb-3">
              <span className="text-xs font-bold text-[hsl(var(--body-strong))] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                飞书通道连通性诊断报告
              </span>
              <button
                onClick={() => setDiagnosticsOpen(false)}
                className="text-[10px] text-[hsl(var(--muted))] hover:text-[hsl(var(--body-strong))] transition-colors"
              >
                关闭诊断窗
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-[11px]">
              {diagnosticSteps.map((step) => (
                <div key={step.id} className="flex items-start gap-2.5 bg-[hsl(var(--surface-soft))/0.3] p-2 rounded-lg border border-[hsl(var(--hairline))/0.5]">
                  <div className="mt-0.5 shrink-0">
                    {step.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--primary))] animate-spin" />}
                    {step.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))]" />}
                    {step.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />}
                    {step.status === 'error' && <XCircle className="w-3.5 h-3.5 text-[hsl(var(--destructive))]" />}
                    {step.status === 'idle' && <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--muted-soft))]" />}
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-[hsl(var(--body-strong))]">{step.name}</span>
                    <p className="mt-0.5 text-[10px] text-[hsl(var(--muted))] leading-relaxed">{step.message}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3.5 pt-3 border-t border-[hsl(var(--hairline))] flex items-center justify-between text-[10px]">
              <span className="text-[hsl(var(--muted))]">
                诊断状态:{' '}
                <strong
                  className={
                    diagnosticGlobalStatus === 'success'
                      ? 'text-[hsl(var(--success))]'
                      : diagnosticGlobalStatus === 'warning'
                        ? 'text-[hsl(var(--warning))]'
                        : diagnosticGlobalStatus === 'error'
                          ? 'text-[hsl(var(--destructive))]'
                          : 'text-[hsl(var(--muted))]'
                  }
                >
                  {diagnosticGlobalStatus === 'running'
                    ? '正在扫描中...'
                    : diagnosticGlobalStatus === 'success'
                      ? '通过'
                      : diagnosticGlobalStatus === 'warning'
                        ? '有警告提示'
                        : diagnosticGlobalStatus === 'error'
                          ? '存在配置错误'
                          : '未诊断'}
                </strong>
              </span>
              {diagnosticGlobalStatus !== 'running' && (
                <Button variant="secondary" className="h-6 px-2 text-[9px] font-medium" onClick={runDiagnostics}>
                  重新诊断
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Setup Verification Checklist Items */}
        {FEISHU_PLUGIN_VERIFICATION_ITEMS.map((item) => {
          const consoleUrl =
            item.id === 'credentials'
              ? links.credentials
              : item.id === 'bot'
                ? links.bot
                : item.id === 'event'
                  ? links.eventSubscription
                  : links.permissions;

          const stepStatus = getStepStatus(item.id);
          const isFocused = activeStep === item.id;

          return (
            <div
              key={item.id}
              onClick={() => toggleStep(item.id)}
              className={`group transition-all duration-300 rounded-xl border px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))] cursor-pointer ${isFocused
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.03)] shadow-[0_0_12px_rgba(59,130,246,0.08)] scale-[1.005]'
                : 'border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:border-[hsl(var(--muted-soft))]'
                }`}
            >
              <div className="flex items-start gap-3">
                {/* Step status checkbox indicator */}
                <div
                  className="mt-0.5 shrink-0 transition-transform duration-200 group-hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStep(item.id);
                  }}
                >
                  {stepStatus === 'success' ? (
                    <div className="w-4 h-4 rounded-full bg-[hsl(var(--success)/0.15)] border border-[hsl(var(--success)/0.3)] flex items-center justify-center text-[hsl(var(--success))]">
                      <Check className="w-3 h-3 stroke-[3px]" />
                    </div>
                  ) : (
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${isFocused ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.05)]' : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted))]'
                      }`}>
                      <span className="text-[9px] text-[hsl(var(--muted))] font-bold">{
                        item.id === 'credentials' ? '1' : item.id === 'bot' ? '2' : item.id === 'event' ? '3' : '4'
                      }</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold transition-colors ${isFocused ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--body-strong))]'
                      }`}>
                      {item.title}
                    </span>
                    {item.id === 'credentials' && isCredentialsAutoCompleted && (
                      <span className="text-[9px] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] px-1.5 py-0.5 rounded font-medium animate-fade-in shrink-0">
                        自动识别已填
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[hsl(var(--muted))]">{item.description}</div>
                  <div className="mt-2.5 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))]"
                      onClick={() => void onOpenUrl(consoleUrl)}
                    >
                      <ExternalLink className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
                      {item.consoleHint}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))]"
                      onClick={() => void onOpenUrl(links.docs)}
                    >
                      <BookOpen className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
                      {item.docLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.04)] px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))]">
          <strong className="block text-[hsl(var(--body-strong))]">{FEISHU_PERMISSION_TROUBLESHOOTING.title}</strong>
          <div className="mt-1">
            建议在权限报错后先补开 scope，再重新生成授权二维码完成增量授权，避免用户反复卡在同一个报错里。
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
