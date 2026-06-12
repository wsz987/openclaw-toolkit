import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../../../components/ui/alert-dialog';
import { Progress } from '../../../../../components/ui/progress';
import { SpinnerIcon } from '../../../../../components/icons';
import type { PluginInstallProgress } from '../../../model/types';

export type PluginUninstallDialogState = 'confirm' | 'loading' | 'error' | 'success';

type PluginUninstallDialogProps = {
  open: boolean;
  state: PluginUninstallDialogState;
  progress: PluginInstallProgress | null;
  error: string | null;
  pluginName: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function PluginUninstallDialog({
  open,
  state,
  progress,
  error,
  pluginName,
  onConfirm,
  onClose
}: PluginUninstallDialogProps) {
  const busy = state === 'loading';
  const progressValue = progress?.progress ?? (busy ? 16 : 0);
  const message =
    error ??
    progress?.message ??
    (state === 'success' ? '已卸载' : state === 'confirm' ? '移除插件与配置' : '处理中...');

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !busy && !nextOpen && onClose()}>
      <AlertDialogContent className="w-[min(92vw,26rem)] gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">
            {state === 'confirm' && '卸载插件'}
            {state === 'loading' && '正在卸载'}
            {state === 'error' && '卸载失败'}
            {state === 'success' && '卸载完成'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {state === 'confirm' && `确认卸载 ${pluginName}？`}
            {state === 'loading' && `${pluginName} 处理中...`}
            {state === 'error' && '请重试。'}
            {state === 'success' && `${pluginName} 已移除。`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state === 'confirm' ? (
          <div className="rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] px-4 py-3 text-sm text-[hsl(var(--body-strong))]">
            将移除当前通道插件
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--body-strong))]">
              {busy ? <SpinnerIcon size={14} className="spinning text-[hsl(var(--primary))]" /> : null}
              <span>{message}</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
        )}

        <AlertDialogFooter>
          {state === 'confirm' ? (
            <>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                className="bg-[hsl(var(--error))] text-white hover:bg-[hsl(var(--error)/0.9)]"
              >
                确认卸载
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogCancel disabled={busy} onClick={onClose}>
              {state === 'error' ? '关闭' : '完成'}
            </AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
