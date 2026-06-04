import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { CheckIcon, ChevronRightIcon } from '../../../components/icons';
import type { Stage1InstallResult } from '../model/types';
import { useOpenClawStatusSubscription } from '../model/openclaw-status-store';

function InstallationSummaryGrid({ result }: { result: Stage1InstallResult }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">工作流 Workflow ID</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.workflowId}</code>
      </div>
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">OpenClaw 版本</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">v{result.openclawVersion}</code>
      </div>
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">Node.js 版本</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">Node {result.nodeVersion}</code>
      </div>
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">配置文件路径</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.configPath}</code>
      </div>
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1 md:col-span-2">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">主程序目录</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.openclawDir}</code>
      </div>
      <div className="bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] p-4 rounded-lg flex flex-col gap-1 md:col-span-2">
        <span className="text-[10px] font-semibold text-[hsl(var(--muted))] uppercase tracking-wider">运行沙箱目录</span>
        <code className="text-xs font-mono text-[hsl(var(--ink))] break-all">{result.nodeDir}</code>
      </div>
    </div>
  );
}

type PostInstallEntryViewProps = {
  result: Stage1InstallResult;
  onContinue: () => void;
  onBack: () => void;
  title?: string;
  description?: string;
  backLabel?: string;
};

export function PostInstallEntryView({
  result,
  onContinue,
  onBack,
  title = '运行环境部署成功',
  description = 'OpenClaw 核心程序及依赖资源已安装完成。接下来建议继续完成初始化与授权，再进入后续运行操作。',
  backLabel = '返回配置首页'
}: PostInstallEntryViewProps) {
  const { status, loading: statusLoading } = useOpenClawStatusSubscription(result.configPath);
  const providerReady = status?.providerInitialized ?? false;

  return (
    <Card className="max-w-4xl mx-auto border-[hsl(var(--success)/0.3)] bg-[hsl(var(--canvas))] py-12 px-8 flex flex-col items-center animate-fade-in shadow-lg">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success))] text-[hsl(var(--success))] mb-6">
        <CheckIcon size={34} />
      </div>
      <CardHeader className="p-0 mb-6 text-center">
        <CardTitle className="text-3xl text-[hsl(var(--ink))]">{title}</CardTitle>
        <CardDescription className="text-sm text-[hsl(var(--body))] mt-2 max-w-2xl mx-auto">{description}</CardDescription>
      </CardHeader>
      <CardContent className="w-full p-0 flex flex-col gap-6">
        <InstallationSummaryGrid result={result} />
        <div className="rounded-xl border border-[hsl(var(--success)/0.18)] bg-[hsl(var(--success)/0.08)] px-5 py-4 text-left">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[hsl(var(--ink))]">下一步</h3>
              <p className="text-xs leading-relaxed text-[hsl(var(--body))] mt-1">
                {providerReady
                  ? '当前安装已经完成初始化，可以直接进入运行后操作。'
                  : '请继续完成 Provider、API Key 与 Agent 权限初始化，确保用户进入 OpenClaw 后即可直接使用。'}
              </p>
            </div>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-[11px] font-semibold ${providerReady
                  ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
                  : 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
                }`}
            >
              {statusLoading ? '状态检查中' : providerReady ? '已完成初始化' : '待初始化'}
            </span>
          </div>
        </div>
      </CardContent>
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        <Button variant="default" onClick={onContinue}>
          {statusLoading ? '下一步' : providerReady ? '进入运行后操作' : '下一步：初始化 OpenClaw'}
          <ChevronRightIcon size={14} className="ml-1.5" />
        </Button>
        {/* <Button variant="secondary" onClick={onBack}>
          {backLabel}
        </Button> */}
      </div>
    </Card>
  );
}
