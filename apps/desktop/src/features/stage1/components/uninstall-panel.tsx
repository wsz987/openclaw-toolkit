import { useEffect, useMemo, useState } from 'react';
import { AlertIcon, CheckIcon, SpinnerIcon, XIcon } from '../../../components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import type {
  UninstallDeletionTarget,
  UninstallPlan,
  Stage1InstallResult,
  UninstallResult
} from '../model/types';

type UninstallPanelProps = {
  result: Stage1InstallResult;
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

    setSelectedScopes(plan.targets.filter((target) => target.selectedByDefault).map((target) => target.scope));
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
      onCompleted?.();
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

  if (!installationId) {
    return (
      <UninstallShell>
        <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.08)] p-5 text-sm text-[hsl(var(--body-strong))]">
          当前安装结果缺少 installationId，请先重新进入一次已安装首页，或重启工具包后再执行卸载。
        </div>
      </UninstallShell>
    );
  }

  return (
    <UninstallShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
            <AlertIcon size={14} className="text-[hsl(var(--error))]" />
            安全卸载
          </div>
          <h2 className="font-serif text-2xl font-normal text-[hsl(var(--ink))] mt-2">卸载 OpenClaw 受管环境</h2>
          <p className="text-xs leading-relaxed text-[hsl(var(--body))] mt-2 max-w-2xl">
            只清理工具包安装记录证明过的受管目录。全局 OpenClaw、全局 Node.js、系统 PATH 和外部工作区不会被自动删除。
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={planLoading || executing}
          onClick={() => void onInspectPlan(installationId)}
          className="h-9 text-xs"
        >
          {planLoading ? <SpinnerIcon size={13} className="spinning mr-1.5" /> : null}
          重新扫描
        </Button>
      </div>

      {planLoading ? (
        <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-6 flex items-center gap-3 text-sm text-[hsl(var(--body))]">
          <SpinnerIcon size={18} className="spinning text-[hsl(var(--primary))]" />
          正在生成卸载预览...
        </div>
      ) : plan ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SummaryTile label="实例" value={plan.displayName} detail={plan.openclawDir} />
            <SummaryTile label="运行状态" value={plan.runtime.running ? '运行中' : '未运行'} detail={plan.runtime.label} />
            <SummaryTile label="确认码" value={plan.confirmationText} detail="卸载前需要输入" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-5 min-h-0">
            <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var(--hairline))] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">将删除的数据</h3>
                  <p className="text-[11px] text-[hsl(var(--muted))] mt-1">默认项为普通卸载，高风险项需手动选择。</p>
                </div>
                <span className="text-[11px] font-medium text-[hsl(var(--muted))]">
                  {selectedScopes.length} / {plan.targets.length} 项
                </span>
              </div>
              <div className="divide-y divide-[hsl(var(--hairline))]">
                {plan.targets.map((target) => (
                  <DeletionTargetRow
                    key={target.scope}
                    target={target}
                    selected={selectedScopes.includes(target.scope)}
                    disabled={executing || !target.owned || target.scope === 'openclawApp'}
                    onToggle={() => toggleScope(target.scope)}
                  />
                ))}
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-4">
                <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">保留内容</h3>
                <div className="flex flex-col gap-3 mt-3">
                  {plan.retained.map((item) => (
                    <div key={`${item.label}-${item.path}`} className="text-xs leading-relaxed">
                      <div className="flex items-center gap-2 text-[hsl(var(--body-strong))] font-medium">
                        <CheckIcon size={13} className="text-[hsl(var(--success))]" />
                        {item.label}
                      </div>
                      <code className="block text-[10px] text-[hsl(var(--muted-soft))] mt-1 break-all">{item.path}</code>
                      <p className="text-[11px] text-[hsl(var(--muted))] mt-1">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.08)] p-4">
                <h3 className="text-sm font-semibold text-[hsl(var(--ink))]">边界提示</h3>
                <ul className="mt-3 flex flex-col gap-2 text-[11px] leading-relaxed text-[hsl(var(--body))]">
                  {plan.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))] flex-shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>

          {error ? (
            <div className="rounded-xl border border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error)/0.08)] p-4 text-xs whitespace-pre-wrap break-all text-[hsl(var(--body-strong))]">
              {error}
            </div>
          ) : null}

          {uninstallResult ? (
            <div className="rounded-xl border border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.08)] p-4 text-sm text-[hsl(var(--body-strong))]">
              卸载完成，已清理 {uninstallResult.deletedScopes.join(', ')}。
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-[hsl(var(--hairline))] pt-4">
            <Button
              variant="destructive"
              disabled={!canOpenConfirm}
              onClick={() => {
                setTypedConfirmation('');
                setConfirmOpen(true);
              }}
              className="min-w-[160px] bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.9)]"
            >
              {executing ? <SpinnerIcon size={14} className="spinning mr-2" /> : <XIcon size={14} className="mr-2" />}
              卸载 OpenClaw
            </Button>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
            <AlertDialogContent className="w-[min(94vw,38rem)] gap-5">
              <AlertDialogHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--error)/0.1)] text-[hsl(var(--error))]">
                    <AlertIcon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <AlertDialogTitle className="text-xl font-semibold tracking-tight">
                      确认卸载 OpenClaw 受管环境
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mt-1 text-xs leading-relaxed">
                      即将停止运行中的受管服务，并删除下列由安装记录证明的目录。全局 OpenClaw、全局 Node.js 和系统 PATH 不会被修改。
                    </AlertDialogDescription>
                  </div>
                </div>
              </AlertDialogHeader>

              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[hsl(var(--ink))]">运行时处理</span>
                    <span className="rounded-full bg-[hsl(var(--warning)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warning))]">
                      {plan.runtime.running ? `将停止 PID ${plan.runtime.pid ?? '未知'}` : '无需停止'}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--body))]">{plan.runtime.label}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[hsl(var(--error)/0.2)] bg-[hsl(var(--error)/0.06)] p-4">
                    <div className="text-xs font-semibold text-[hsl(var(--ink))]">将删除</div>
                    <div className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                      {selectedTargets.map((target) => (
                        <div key={target.scope} className="text-[11px] leading-relaxed">
                          <div className="font-semibold text-[hsl(var(--body-strong))]">{scopeLabel(target.scope)}</div>
                          <code className="block break-all text-[10px] text-[hsl(var(--muted-soft))]">{target.path}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.06)] p-4">
                    <div className="text-xs font-semibold text-[hsl(var(--ink))]">将保留</div>
                    <div className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                      {plan.retained.map((item) => (
                        <div key={`${item.label}-${item.path}`} className="text-[11px] leading-relaxed">
                          <div className="font-semibold text-[hsl(var(--body-strong))]">{item.label}</div>
                          <code className="block break-all text-[10px] text-[hsl(var(--muted-soft))]">{item.path}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[hsl(var(--error)/0.24)] bg-[hsl(var(--error)/0.06)] p-4">
                  <label className="text-xs font-semibold text-[hsl(var(--ink))]">
                    输入 {plan.confirmationText} 确认卸载
                  </label>
                  <Input
                    className="mt-2"
                    value={typedConfirmation}
                    disabled={executing}
                    aria-invalid={typedConfirmation.length > 0 && typedConfirmation !== plan.confirmationText}
                    onChange={(event) => setTypedConfirmation(event.target.value)}
                    placeholder={plan.confirmationText}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--muted))]">
                    该确认码用于防止误触。工作区和备份仅在你已勾选对应项时才会删除。
                  </p>
                </div>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={executing}>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canExecute}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleExecute();
                  }}
                  className="bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.9)]"
                >
                  {executing ? <SpinnerIcon size={14} className="spinning mr-2" /> : <XIcon size={14} className="mr-2" />}
                  确认卸载
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-6 text-sm text-[hsl(var(--body))]">
          尚未生成卸载预览。
        </div>
      )}
    </UninstallShell>
  );
}

function UninstallShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] shadow-sm h-full overflow-y-auto p-6 flex flex-col gap-5">
      {children}
    </div>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-card))] p-4 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">{label}</div>
      <div className="text-sm font-semibold text-[hsl(var(--ink))] mt-2 truncate">{value}</div>
      <code className="block text-[10px] text-[hsl(var(--muted-soft))] mt-1 truncate">{detail}</code>
    </div>
  );
}

function DeletionTargetRow({
  target,
  selected,
  disabled,
  onToggle
}: {
  target: UninstallDeletionTarget;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const riskClass =
    target.risk === 'high'
      ? 'bg-[hsl(var(--error)/0.1)] text-[hsl(var(--error))]'
      : target.risk === 'medium'
        ? 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]'
        : 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]';

  return (
    <label className={`flex items-start gap-4 px-5 py-4 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-[hsl(var(--surface-soft))]'}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-[hsl(var(--hairline))] accent-[hsl(var(--primary))]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[hsl(var(--ink))]">{scopeLabel(target.scope)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskClass}`}>{riskLabel(target.risk)}</span>
          {!target.owned ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[hsl(var(--error)/0.1)] text-[hsl(var(--error))]">
              非受管，已禁止
            </span>
          ) : null}
        </div>
        <p className="text-xs text-[hsl(var(--body))] mt-1">{target.reason}</p>
        <code className="block text-[10px] text-[hsl(var(--muted-soft))] mt-2 break-all">{target.path}</code>
        <div className="text-[10px] text-[hsl(var(--muted))] mt-1">{formatBytes(target.estimatedBytes)}</div>
      </div>
    </label>
  );
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    openclawApp: 'OpenClaw 主程序',
    managedNode: '受管 Node Runtime',
    skills: 'Skill 目录',
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
