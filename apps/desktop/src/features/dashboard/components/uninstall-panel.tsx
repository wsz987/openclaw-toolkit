import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Folder,
  HardDrive,
  Info,
  Lock,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  UninstallDeletionTarget,
  UninstallPlan,
  OpenClawInstallResult,
  UninstallResult
} from '@/openclaw/model/types';

type UninstallPanelProps = {
  result: OpenClawInstallResult;
  plan: UninstallPlan | null;
  planLoading: boolean;
  executing: boolean;
  uninstallResult: UninstallResult | null;
  error: string | null;
  onInspectPlan: (installationId: string) => Promise<UninstallPlan | null>;
  onExecuteUninstall: (
    installationId: string,
    selectedScopes: string[],
    typedConfirmation?: string | null
  ) => Promise<UninstallResult | null>;
  onCompleted?: () => void;
};

export function UninstallPanel({
  result,
  plan,
  planLoading,
  executing,
  uninstallResult,
  error,
  onInspectPlan,
  onExecuteUninstall,
  onCompleted
}: UninstallPanelProps) {
  const installationId = result.installationId ?? null;
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!installationId) {
      return;
    }

    void onInspectPlan(installationId);
  }, [installationId, onInspectPlan]);

  useEffect(() => {
    if (!plan) {
      setSelectedScopes([]);
      return;
    }

    setSelectedScopes(
      plan.targets.filter((target) => target.selectedByDefault).map((target) => target.scope)
    );
  }, [plan]);

  const canOpenConfirm = Boolean(plan) && selectedScopes.includes('openclawApp') && !executing;
  const canExecute =
    Boolean(installationId) &&
    Boolean(plan) &&
    canOpenConfirm &&
    typedConfirmation === plan?.confirmationText;

  const selectedTargets = useMemo(
    () => plan?.targets.filter((target) => selectedScopes.includes(target.scope)) ?? [],
    [plan, selectedScopes]
  );

  async function handleExecute() {
    if (!installationId || !canExecute) {
      return;
    }

    const response = await onExecuteUninstall(installationId, selectedScopes, typedConfirmation);
    if (response) {
      setConfirmOpen(false);
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  }

  function handleConfirmOpenChange(open: boolean) {
    if (executing) {
      return;
    }

    setConfirmOpen(open);
    if (!open) {
      setTypedConfirmation('');
    }
  }

  // Calculate spaces
  const totalSpace = useMemo(() => {
    return plan?.targets.reduce((acc, target) => acc + (target.estimatedBytes ?? 0), 0) ?? 0;
  }, [plan]);

  const selectedSpace = useMemo(() => {
    return plan?.targets
      .filter((target) => selectedScopes.includes(target.scope))
      .reduce((acc, target) => acc + (target.estimatedBytes ?? 0), 0) ?? 0;
  }, [plan, selectedScopes]);

  const savedSpace = useMemo(() => {
    if (!uninstallResult) return 0;
    return plan?.targets
      .filter((target) => uninstallResult.deletedScopes.includes(target.scope))
      .reduce((acc, target) => acc + (target.estimatedBytes ?? 0), 0) ?? 0;
  }, [plan, uninstallResult]);

  // Error boundary missing installationId
  if (!installationId) {
    return (
      <UninstallShell>
        <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.06)] p-5 text-xs text-[hsl(var(--body-strong))] leading-relaxed flex items-start gap-3">
          <Info size={16} className="text-[hsl(var(--warning))] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-[hsl(var(--ink))]">无法执行卸载</h4>
            <p className="text-[hsl(var(--body))] mt-1">
              当前实例缺少 installationId。请回到已安装首页重试，或重启应用。
            </p>
          </div>
        </div>
      </UninstallShell>
    );
  }

  // Success view
  if (uninstallResult) {
    return (
      <UninstallShell>
        <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto w-full">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.25)] text-[hsl(var(--success))] mb-4 shadow-sm">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="text-xl font-semibold text-[hsl(var(--ink))]">卸载成功</h2>
          <p className="text-xs text-[hsl(var(--muted))] mt-1.5 max-w-sm leading-relaxed">
            该 OpenClaw 实例的受管数据已清理完成。系统共释放了 {formatBytes(savedSpace)} 的磁盘空间。
          </p>

          <div className="w-full mt-6 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.5] overflow-hidden text-left">
            <div className="px-4 py-2.5 border-b border-[hsl(var(--hairline))] text-[11px] font-semibold text-[hsl(var(--ink))] bg-[hsl(var(--surface-soft))]">
              已清理的受管组件及路径
            </div>
            <div className="divide-y divide-[hsl(var(--hairline))] max-h-48 overflow-y-auto px-4 py-2 bg-[hsl(var(--canvas))] text-xs font-sans">
              {plan?.targets.map((target) => {
                const isDeleted = uninstallResult.deletedScopes.includes(target.scope);
                return (
                  <div key={target.scope} className="py-2 flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-4">
                      <span className={`font-semibold ${isDeleted ? 'text-[hsl(var(--muted))] line-through' : 'text-[hsl(var(--ink))]'}`}>
                        {scopeLabel(target.scope)}
                      </span>
                      <code className="block text-[10px] text-[hsl(var(--muted-soft))] truncate mt-0.5 font-mono">{target.path}</code>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-medium ${isDeleted ? 'text-[hsl(var(--error))]' : 'text-[hsl(var(--muted))]'}`}>
                      {isDeleted ? '已清理' : '已保留'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            onClick={onCompleted}
            className="mt-8 min-w-[140px] h-9 text-xs font-semibold"
          >
            完成并返回
          </Button>
        </div>
      </UninstallShell>
    );
  }

  // Executing View
  if (executing) {
    return (
      <UninstallShell>
        <div className="flex flex-col flex-1 items-center justify-center py-20 text-center max-w-md mx-auto w-full">
          <RefreshCw size={28} className="text-[hsl(var(--primary))] animate-spin mb-4" />
          <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">正在卸载 OpenClaw...</h3>
          <p className="text-xs text-[hsl(var(--muted))] mt-1.5 leading-relaxed">
            正在自动终止运行进程并清理受管目录文件，请勿关闭窗口或强制退出程序。
          </p>
        </div>
      </UninstallShell>
    );
  }

  // Scanning / Loading View
  if (planLoading) {
    return (
      <UninstallShell>
        <div className="flex flex-col items-center flex-1 justify-center py-20 text-center">
          <RefreshCw size={24} className="text-[hsl(var(--muted-soft))] animate-spin mb-3" />
          <p className="text-xs text-[hsl(var(--muted))]">正在扫描实例并生成安全卸载预览...</p>
        </div>
      </UninstallShell>
    );
  }

  // Main UI
  return (
    <UninstallShell
      footer={
        plan ? (
          <div className="flex justify-end w-full">
            <Button
              variant="destructive"
              disabled={!canOpenConfirm}
              onClick={() => {
                setTypedConfirmation('');
                setConfirmOpen(true);
              }}
              className="h-9 rounded-lg min-w-[140px] bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.95)] transition-all font-semibold text-xs gap-1.5 shadow-sm"
            >
              <Trash2 size={13} />
              卸载 OpenClaw
            </Button>
          </div>
        ) : null
      }
    >
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--hairline))] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--ink))]">卸载与清理</h2>
          <p className="text-xs text-[hsl(var(--muted))] mt-1 leading-relaxed">
            您可以自主选择需要清理的实例资产目录。全局 Node.js 安装、全局 system PATH 以及位于外部的资源库不包含在清理范围内。
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            disabled={planLoading || executing}
            onClick={() => void onInspectPlan(installationId)}
            className="h-8 text-xs border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-soft))]"
          >
            <RefreshCw size={12} className="mr-1.5" />
            重新扫描
          </Button>
        </div>
      </div>

      {plan ? (
        <div className="flex flex-col gap-5">
          {/* Metadata Info Bar */}
          <div className="text-xs text-[hsl(var(--body))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] rounded-lg px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="text-[10px] text-[hsl(var(--muted))] block">卸载实例：</span>
              <strong className="text-[hsl(var(--ink))] mt-0.5 block truncate">{plan.displayName}</strong>
            </div>
            <div>
              <span className="text-[10px] text-[hsl(var(--muted))] block">实例目录：</span>
              <code className="text-[hsl(var(--muted-soft))] font-mono mt-0.5 block truncate">{plan.openclawDir}</code>
            </div>
            <div>
              <span className="text-[10px] text-[hsl(var(--muted))] block">运行状态：</span>
              <span className={`inline-flex items-center gap-1.5 font-medium mt-0.5 ${plan.runtime.running ? 'text-[hsl(var(--warning))] animate-pulse' : 'text-[hsl(var(--body-strong))]'}`}>
                {plan.runtime.running ? '关联进程正在运行中 (卸载时将自动终止)' : '未检测到进程运行'}
              </span>
            </div>
          </div>

          {/* Core Directory Checklist Table */}
          <div className="border border-[hsl(var(--hairline))] rounded-lg overflow-hidden bg-[hsl(var(--surface-card))]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[hsl(var(--surface-soft))] border-b border-[hsl(var(--hairline))] text-[11px] font-semibold text-[hsl(var(--muted))]">
                  <th className="py-2 px-4 w-14 text-center">选择</th>
                  <th className="py-2 px-3 w-40">组件项</th>
                  <th className="py-2 px-3">绝对路径</th>
                  <th className="py-2 px-3 w-24 text-right">占用大小</th>
                  <th className="py-2 px-3 w-28 text-center">风险提示</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] text-[hsl(var(--body))] font-sans">
                {plan.targets.map((target) => {
                  const isApp = target.scope === 'openclawApp';
                  const isDisabled = executing || !target.owned || isApp;

                  let riskColor = 'text-[hsl(var(--muted-soft))]';
                  if (target.risk === 'high') riskColor = 'text-[hsl(var(--error))]';
                  else if (target.risk === 'medium') riskColor = 'text-[hsl(var(--warning))]';

                  return (
                    <tr
                      key={target.scope}
                      onClick={() => {
                        if (!isDisabled) toggleScope(target.scope);
                      }}
                      className={`hover:bg-[hsl(var(--surface-soft))/0.3] transition-colors ${isDisabled ? 'opacity-60' : 'cursor-pointer'
                        }`}
                    >
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(target.scope)}
                          disabled={isDisabled}
                          onChange={() => toggleScope(target.scope)}
                          className="h-3.5 w-3.5 rounded border-[hsl(var(--hairline))] accent-[hsl(var(--primary))] cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-3 px-3 font-semibold text-[hsl(var(--ink))]">
                        {scopeLabel(target.scope)}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-[hsl(var(--muted-soft))] break-all select-all">
                        {target.path}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[10px]">
                        {formatBytes(target.estimatedBytes)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {!target.owned ? (
                          <span className="text-[10px] font-semibold text-[hsl(var(--error))]">受保护/非独占</span>
                        ) : (
                          <span className={`text-[10px] font-semibold ${riskColor}`}>{riskLabel(target.risk)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stats and Warnings summary */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-[hsl(var(--hairline))] rounded-lg p-4 bg-[hsl(var(--surface-soft))/0.2]">
            <div className="text-xs leading-relaxed text-[hsl(var(--muted))] flex-1 max-w-xl">
              <span className="font-semibold text-[hsl(var(--ink))] block mb-1">卸载安全边界说明：</span>
              <ul className="list-disc pl-4 flex flex-col gap-1 text-[11px]">
                <li>实例内的主程序及配置文件将被安全注销移入临时备份。</li>
                {selectedScopes.includes('workspace') && (
                  <li className="text-[hsl(var(--error))] font-semibold">您已勾选删除工作区（workspace），该目录下的 Agent 文件及会话库将不可逆地擦除。</li>
                )}
                <li>系统全局变量、外部文件资产以及非本实例独占目录将被予以保留。</li>
              </ul>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-[10px] text-[hsl(var(--muted))] block">预计释放磁盘空间：</span>
              <strong className="text-xl font-semibold text-[hsl(var(--primary))] block mt-1 font-mono">{formatBytes(selectedSpace)}</strong>
            </div>
          </div>



          {/* Final Double Check Dialog */}
          <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
            <AlertDialogContent className="w-[min(90vw,26rem)] gap-4 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] shadow-lg p-5 font-sans">
              <AlertDialogHeader>
                <div className="flex items-center gap-2 text-[hsl(var(--error))]">
                  <AlertTriangle size={18} className="flex-shrink-0" />
                  <AlertDialogTitle className="text-sm font-semibold">
                    确认卸载 OpenClaw
                  </AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-[11px] text-[hsl(var(--muted))] leading-relaxed mt-1">
                  该操作无法撤销。系统将终止运行中的服务进程，并清理以下已选择的受管数据目录。
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="flex flex-col gap-3.5">
                {/* Clean summary list */}
                <div className="text-[11px] leading-relaxed text-[hsl(var(--body-strong))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] rounded-lg px-3 py-2">
                  <span className="font-semibold text-[hsl(var(--ink))]">将清理的组件：</span>
                  <span className="text-[hsl(var(--muted-soft))]">
                    {selectedTargets.map((t) => scopeLabel(t.scope)).join('、')}
                  </span>
                  {plan.runtime.running && (
                    <span className="block mt-1 text-[hsl(var(--warning))] font-medium">
                      ⚠️ 关联运行进程 (PID: {plan.runtime.pid}) 将被强制终止
                    </span>
                  )}
                </div>

                {/* Input verification */}
                <div className="flex flex-col gap-1.5 text-[11px]">
                  <label className="font-semibold text-[hsl(var(--ink))] flex items-center justify-between">
                    <span>请输入安全确认码：</span>
                    <span className="font-mono font-bold text-[hsl(var(--primary))] bg-[hsl(var(--surface-soft))] border border-[hsl(var(--hairline))] rounded px-1.5 py-0.5">
                      {plan.confirmationText}
                    </span>
                  </label>
                  <Input
                    className="h-8 bg-[hsl(var(--canvas))] border-[hsl(var(--hairline))] text-xs focus-visible:ring-[hsl(var(--primary))]"
                    value={typedConfirmation}
                    disabled={executing}
                    onChange={(event) => setTypedConfirmation(event.target.value.toUpperCase())}
                    placeholder={plan.confirmationText}
                  />
                </div>
              </div>

              <AlertDialogFooter className="border-t border-[hsl(var(--hairline))] pt-3 mt-1 flex justify-end gap-2 text-xs">
                <AlertDialogCancel
                  disabled={executing}
                  className="h-8 text-xs rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:bg-[hsl(var(--surface-soft))] text-[hsl(var(--body))] px-4"
                >
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canExecute}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleExecute();
                  }}
                  className="h-8 text-xs rounded-lg bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.95)] disabled:opacity-40 disabled:cursor-not-allowed px-4 min-w-[80px]"
                >
                  {executing ? <RefreshCw size={12} className="animate-spin mr-1" /> : null}
                  确认卸载
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-6 text-sm text-[hsl(var(--body))] flex items-center justify-center py-20 text-center animate-fade-in shadow-sm">
          <div>
            <Info className="w-10 h-10 text-[hsl(var(--muted))] mx-auto mb-3" />
            <p className="text-xs text-[hsl(var(--muted))]">未能生成卸载计划，请重新扫描以初始化。</p>
          </div>
        </div>
      )}
    </UninstallShell>
  );
}

function UninstallShell({
  children,
  footer
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] shadow-sm h-full flex flex-col font-sans overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0">
        {children}
      </div>
      {footer && (
        <div className="flex-none p-5 border-t border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))]">
          {footer}
        </div>
      )}
    </div>
  );
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    openclawApp: 'OpenClaw 主程序',
    managedNode: '受管 Node Runtime',
    logs: '日志',
    backups: '备份',
    workspace: '工作区'
  };
  return labels[scope] ?? scope;
}

function riskLabel(risk: string) {
  if (risk === 'high') return '高风险';
  if (risk === 'medium') return '中风险';
  return '低风险';
}

// Format space values
function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '大小未知';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
