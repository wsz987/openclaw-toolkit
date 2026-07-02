import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { PluginInstallProgress } from '@/openclaw/model/types';

type PluginInstallDialogProps = {
  open: boolean;
  installing: boolean;
  progress: PluginInstallProgress | null;
  error: string | null;
  title: string;
  description: string;
  idleMessage: string;
  installingLabel: string;
  errorLabel: string;
  cancelLabel?: string;
  closeLabel?: string;
  onCancel: () => void;
};

export function PluginInstallDialog({
  open,
  installing,
  progress,
  error,
  title,
  description,
  idleMessage,
  installingLabel,
  errorLabel,
  cancelLabel = '取消',
  closeLabel = '关闭',
  onCancel
}: PluginInstallDialogProps) {
  const progressValue = progress?.progress ?? (installing ? 12 : 0);
  const logLine = error ?? progress?.message ?? idleMessage;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !installing && !nextOpen && onCancel()}>
      <AlertDialogContent className="w-[min(92vw,32rem)] gap-5">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-4 rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[hsl(var(--body-strong))]">
              {installing ? installingLabel : error ? errorLabel : '等待开始'}
            </span>
            <span className="text-xs font-medium text-[hsl(var(--muted))]">{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-2.5 bg-[hsl(var(--canvas))]" />
          <div className="min-h-5 text-xs leading-relaxed text-[hsl(var(--body))]">{logLine}</div>
        </div>

        <AlertDialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={installing} className="min-w-[120px]">
            {error ? closeLabel : cancelLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
