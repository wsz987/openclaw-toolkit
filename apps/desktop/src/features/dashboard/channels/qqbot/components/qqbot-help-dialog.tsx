import { Copy, HelpCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { QQBOT_TROUBLESHOOTING } from '../model/qqbot-docs';

type QqbotHelpDialogProps = {
  open: boolean;
  copied: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
};

export function QqbotHelpDialog({ open, copied, onOpenChange, onCopy }: QqbotHelpDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,32rem)] gap-5 p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg font-bold text-[hsl(var(--body-strong))]">
            <HelpCircle className="h-5 w-5 text-[hsl(var(--primary))]" />
            {QQBOT_TROUBLESHOOTING.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed text-[hsl(var(--muted))]">
            按以下顺序检查，通常可以定位 QQ Bot 通道接入问题。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ol className="space-y-2 text-xs leading-relaxed text-[hsl(var(--body))]">
          {QQBOT_TROUBLESHOOTING.steps.map((step, index) => (
            <li key={step} className="flex gap-2 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.35] p-3">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-[10px] font-semibold text-[hsl(var(--primary))]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <AlertDialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="secondary" className="h-9 w-full text-[11px]" onClick={onCopy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copied ? '已复制排查清单' : '复制排查清单'}
            </Button>
            <AlertDialogAction className="h-9 w-full text-[11px] font-medium">关闭</AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
