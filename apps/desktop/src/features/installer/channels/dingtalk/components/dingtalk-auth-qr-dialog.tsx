import { ExternalLink, Loader2, QrCode, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../../../components/ui/alert-dialog';
import { Button } from '../../../../../components/ui/button';
import { useQrCodeDisplay } from '../../shared/hooks/use-qr-code-display';

type DingtalkAuthQrDialogProps = {
  open: boolean;
  loading: boolean;
  polling: boolean;
  error: string | null;
  statusLabel: string;
  verificationUriComplete: string | null;
  expiresIn: number | null;
  onOpenChange: (open: boolean) => void;
  onGenerate: () => void;
  onOpenLink: (url: string) => void;
};

export function DingtalkAuthQrDialog({
  open,
  loading,
  polling,
  error,
  statusLabel,
  verificationUriComplete,
  expiresIn,
  onOpenChange,
  onGenerate,
  onOpenLink
}: DingtalkAuthQrDialogProps) {
  const { qrDataUrl, timeLeft, isExpired, formatTime } = useQrCodeDisplay({
    open,
    source: verificationUriComplete,
    expiresIn,
    loading
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,28rem)] gap-5 p-6">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-[hsl(var(--body-strong))]">
            <QrCode className="h-5 w-5 text-[hsl(var(--primary))]" />
            钉钉扫码授权
          </AlertDialogTitle>
          <AlertDialogDescription className="max-w-[320px] text-xs leading-relaxed text-[hsl(var(--muted))]">
            请使用手机钉钉扫描二维码，一键创建并授权机器人。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-[248px] w-[248px] items-center justify-center rounded-3xl border border-[hsl(var(--hairline))] bg-white p-4 shadow-sm">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--primary))]" />
                <span className="text-[11px] text-[hsl(var(--muted))]">正在生成钉钉授权二维码...</span>
              </div>
            ) : qrDataUrl ? (
              <>
                <img src={qrDataUrl} alt="DingTalk auth QR code" className="h-[208px] w-[208px] rounded-2xl" />
                {isExpired ? (
                  <button
                    type="button"
                    onClick={onGenerate}
                    className="absolute inset-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-[hsl(var(--hairline))] bg-white/95 text-[hsl(var(--body-strong))] backdrop-blur-xs"
                  >
                    <div className="rounded-full bg-[hsl(var(--primary)/0.08)] p-3 text-[hsl(var(--primary))]">
                      <RefreshCw className="h-5 w-5" />
                    </div>
                    <span className="mt-3 text-xs font-semibold">二维码已失效</span>
                    <span className="mt-1 text-[10px] text-[hsl(var(--muted))]">点击重新生成</span>
                  </button>
                ) : null}
              </>
            ) : (
              <div className="flex max-w-[180px] flex-col items-center gap-3 text-center text-xs text-[hsl(var(--muted))]">
                <span>{error ?? '尚未生成二维码，请重新发起授权。'}</span>
                <Button type="button" variant="secondary" className="h-8 text-[11px]" onClick={onGenerate}>
                  重新生成
                </Button>
              </div>
            )}
          </div>

          {qrDataUrl && !loading ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[hsl(var(--muted))]">
                <span>{statusLabel}</span>
                {polling ? <Loader2 className="h-3 w-3 animate-spin text-[hsl(var(--primary))]" /> : null}
              </div>
              {timeLeft > 0 ? (
                <span className="text-[11px] text-[hsl(var(--muted))]">
                  请在 <strong className="font-mono text-[hsl(var(--primary))]">{formatTime(timeLeft)}</strong> 内完成扫码
                </span>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="w-full rounded-lg border border-[hsl(var(--error)/0.2)] bg-[hsl(var(--error)/0.06)] px-4 py-3 text-xs leading-relaxed text-[hsl(var(--body-strong))]">
              {error}
            </div>
          ) : null}
        </div>

        <AlertDialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row ">
            {verificationUriComplete ? (
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full px-4 text-[11px] font-medium"
                onClick={() => onOpenLink(verificationUriComplete)}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                浏览器打开授权链接
              </Button>
            ) : null}
            <AlertDialogAction className="h-9 w-full text-[11px] font-medium">关闭窗口</AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
