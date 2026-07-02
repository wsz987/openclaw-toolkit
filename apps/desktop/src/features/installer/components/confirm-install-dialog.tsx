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
import type { InstallDashboard } from '@/openclaw/model/types';
import { AlertTriangle, Folder, Cpu, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  confirmationDescription: string;
  systemOpenclaw: InstallDashboard['systemOpenclaw'];
  confirmationTargetVersion: string;
  installPlan: InstallDashboard['installPlan'];
  installActionLabel: string;
  onConfirm: () => void;
};

export function ConfirmInstallDialog({
  open,
  onOpenChange,
  loading,
  confirmationDescription,
  systemOpenclaw,
  confirmationTargetVersion,
  installPlan,
  installActionLabel,
  onConfirm
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="relative pb-1">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))] shrink-0 mt-0.5">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">
                部署独立隔离运行环境
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1 text-xs text-[hsl(var(--body))] leading-relaxed">
                {confirmationDescription}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {/* 核心对比区 */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 my-1.5">
          
          {/* 左侧：全局环境 */}
          <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-3.5 shadow-2xs min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted))] truncate">
              系统全局 OpenClaw
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xs font-semibold text-[hsl(var(--body-strong))]">版本</span>
              <span className="inline-flex items-center rounded-full bg-zinc-200/75 px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--muted))]">
                {systemOpenclaw.version ? `v${systemOpenclaw.version}` : '已安装'}
              </span>
            </div>
            {systemOpenclaw.executable && (
              <span 
                className="text-[9px] font-mono text-[hsl(var(--muted-soft))] truncate mt-1 block" 
                title={systemOpenclaw.executable}
              >
                {systemOpenclaw.executable}
              </span>
            )}
            {systemOpenclaw.error && (
              <span className="text-[9px] text-[hsl(var(--error))] truncate mt-0.5 block" title={systemOpenclaw.error}>
                读取异常: {systemOpenclaw.error}
              </span>
            )}
          </div>

          {/* 中间指示 */}
          <div className="flex md:flex-col items-center justify-center gap-1 text-[hsl(var(--muted-soft))] shrink-0 py-0.5">
            <div className="h-px w-6 md:h-4 md:w-px bg-[hsl(var(--hairline))]"></div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--hairline))] bg-white shadow-3xs">
              <ArrowRight className="h-3.5 w-3.5 rotate-90 md:rotate-0 text-[hsl(var(--primary))]" />
            </div>
            <div className="h-px w-6 md:h-4 md:w-px bg-[hsl(var(--hairline))]"></div>
          </div>

          {/* 右侧：隔离环境 */}
          <div className="flex flex-col gap-1 rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.02)] p-3.5 shadow-2xs min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--primary))] truncate">
              受管隔离 (本次部署)
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xs font-semibold text-[hsl(var(--body-strong))]">版本</span>
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary)/0.08)] px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.15)]">
                v{confirmationTargetVersion}
              </span>
            </div>
            <span className="text-[9px] font-mono text-[hsl(var(--muted-soft))] truncate mt-1 block">
              Node {installPlan.targetNodeVersion ?? '受管版本'}
            </span>
          </div>

        </div>

        {/* 隔离运行环境三要点 */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-[hsl(var(--hairline))] bg-zinc-50/40 p-2.5 text-[10px] text-[hsl(var(--body))]">
          <div className="flex items-center gap-1 justify-center whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
            <span className="font-medium text-[9px] sm:text-[10px]">独立沙箱环境</span>
          </div>
          <div className="flex items-center gap-1 justify-center border-x border-[hsl(var(--hairline))] px-1 whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
            <span className="font-medium text-[9px] sm:text-[10px]">全局配置零修改</span>
          </div>
          <div className="flex items-center gap-1 justify-center whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0" />
            <span className="font-medium text-[9px] sm:text-[10px]">双版本共存运行</span>
          </div>
        </div>

        {/* 执行动作一行流 */}
        <div className="flex justify-between items-center text-[10px] px-1 text-[hsl(var(--muted))] mt-0.5">
          <span>准备执行：</span>
          <span className="font-semibold text-[hsl(var(--primary))] inline-flex items-center gap-1">
            <RefreshCw className="h-2.5 w-2.5 animate-spin" style={{ animationDuration: '3s' }} />
            {installActionLabel}独立隔离版 OpenClaw
          </span>
        </div>

        <AlertDialogFooter className="mt-1">
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {loading ? '执行中...' : `确认${installActionLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

