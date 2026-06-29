import { Check, Copy, ExternalLink, LifeBuoy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../../../components/ui/alert-dialog';
import { Button } from '../../../../../components/ui/button';
import { DINGTALK_PERMISSION_TROUBLESHOOTING } from '../model/dingtalk-docs';

type DingtalkHelpDialogProps = {
  open: boolean;
  copied: boolean;
  onCopy: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenPermissions: () => void;
};

export function DingtalkHelpDialog({
  open,
  copied,
  onCopy,
  onOpenChange,
  onOpenPermissions
}: DingtalkHelpDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,38rem)] gap-5">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-2xl">
            <LifeBuoy className="h-5 w-5 text-[hsl(var(--primary))]" />
            常见问题排查
          </AlertDialogTitle>
          <AlertDialogDescription>{DINGTALK_PERMISSION_TROUBLESHOOTING.title}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
          <div className="space-y-2 text-xs leading-relaxed text-[hsl(var(--body))]">
            {DINGTALK_PERMISSION_TROUBLESHOOTING.steps.map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.08)] text-[10px] font-semibold text-[hsl(var(--primary))]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-4">
          <div className="text-[11px] font-semibold text-[hsl(var(--body-strong))]">可复制给用户的处理说明</div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[hsl(var(--body))]">
            {DINGTALK_PERMISSION_TROUBLESHOOTING.copyText}
          </pre>
        </div>

        <AlertDialogFooter>
          <Button variant="secondary" className="min-w-[132px]" onClick={onOpenPermissions}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            打开开发者后台
          </Button>
          <Button variant="secondary" className="min-w-[132px]" onClick={onCopy}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制说明'}
          </Button>
          <AlertDialogCancel>关闭</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
