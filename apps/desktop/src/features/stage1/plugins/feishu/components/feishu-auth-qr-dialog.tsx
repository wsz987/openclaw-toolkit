import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, QrCode, Loader2, RefreshCw } from 'lucide-react';
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
import { Button } from '../../../../../components/ui/button';
import type { FeishuAuthQrResult } from '../../../model/types';

type FeishuAuthQrDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  result: FeishuAuthQrResult | null;
  copiedValue: string | null;
  onOpenChange: (open: boolean) => void;
  onGenerate: () => void;
  onCopy: (value: string) => void;
  onOpenLink: (url: string) => void;
};

export function FeishuAuthQrDialog({
  open,
  loading,
  error,
  result,
  copiedValue,
  onOpenChange,
  onGenerate,
  onCopy,
  onOpenLink
}: FeishuAuthQrDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Render QR Code from URL
  useEffect(() => {
    let disposed = false;

    async function renderQrCode() {
      if (!result?.verificationUriComplete) {
        setQrDataUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(result.verificationUriComplete, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 200
        });
        if (!disposed) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        if (!disposed) {
          setQrDataUrl(null);
        }
      }
    }

    void renderQrCode();

    return () => {
      disposed = true;
    };
  }, [result?.verificationUriComplete]);

  // Handle countdown timer
  useEffect(() => {
    if (open && result?.expiresIn) {
      setTimeLeft(result.expiresIn);
    } else {
      setTimeLeft(0);
    }
  }, [result, open]);

  useEffect(() => {
    if (timeLeft <= 0 || loading || !open) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, loading, open]);

  const isExpired = timeLeft <= 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(90vw,24rem)] gap-6 p-6 flex flex-col items-center">
        <AlertDialogHeader className="items-center text-center w-full">
          <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-[hsl(var(--body-strong))]">
            <QrCode className="h-5 w-5 text-[hsl(var(--primary))]" />
            插件扫码授权
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-[hsl(var(--muted))] leading-relaxed max-w-[280px]">
            请使用飞书移动端扫码进行权限授权。若无法扫码，亦可复制授权链接在浏览器中完成。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* QR Code container with overlay */}
        <div className="flex flex-col items-center w-full">
          <div className="relative flex items-center justify-center rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-4 w-[220px] h-[220px] shadow-sm bg-white">
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
                <span className="text-[11px] text-[hsl(var(--muted))]">正在获取授权链接...</span>
              </div>
            ) : qrDataUrl ? (
              <div className="relative w-[188px] h-[188px]">
                <img src={qrDataUrl} alt="Feishu auth QR code" className="h-[188px] w-[188px] rounded-lg" />

                {/* Expired Mask Overlay */}
                {isExpired && (
                  <div
                    onClick={onGenerate}
                    className="absolute inset-0 bg-white/96 dark:bg-zinc-950/96 backdrop-blur-xs flex flex-col items-center justify-center cursor-pointer rounded-lg border border-[hsl(var(--hairline))] animate-fade-in group select-none"
                  >
                    <div className="p-2.5 rounded-full bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] group-hover:scale-110 transition-transform duration-200">
                      <RefreshCw className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
                    </div>
                    <span className="text-xs font-bold text-[hsl(var(--body-strong))] mt-2">二维码已失效</span>
                    <span className="text-[10px] text-[hsl(var(--muted))] mt-0.5">点击屏幕重新获取</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-xs text-[hsl(var(--muted))] px-3 flex flex-col items-center gap-3">
                {error ? (
                  <span className="text-red-500 leading-normal">{error}</span>
                ) : (
                  <span>未生成授权凭证</span>
                )}
                <Button variant="secondary" className="h-8 text-[11px]" onClick={onGenerate}>
                  重新生成
                </Button>
              </div>
            )}
          </div>

          {/* Live countdown */}
          {!isExpired && qrDataUrl && !loading && (
            <div className="text-[11px] text-[hsl(var(--muted))] mt-3 flex items-center gap-1.5 animate-fade-in font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse shrink-0" />
              <span>
                请于 <strong className="font-mono text-[hsl(var(--primary))] font-bold">{formatTime(timeLeft)}</strong> 内完成扫码授权
              </span>
            </div>
          )}
        </div>

        {/* Buttons Group */}
        <div className="flex flex-col gap-2 w-full">
          {result?.verificationUriComplete && (
            <div className="grid grid-cols-2 gap-2 w-full">
              <Button
                variant="secondary"
                onClick={() => onCopy(result.verificationUriComplete)}
                className="h-9 text-[11px] font-medium"
              >
                {copiedValue === result?.verificationUriComplete ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5 text-[hsl(var(--muted))]" />
                    复制链接
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={() => onOpenLink(result.verificationUriComplete)}
                className="h-9 text-[11px] font-medium"
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5 text-[hsl(var(--muted))]" />
                浏览器打开
              </Button>
            </div>
          )}

          <AlertDialogFooter className="w-full">
            <AlertDialogAction className="w-full h-9 text-[11px] font-medium">
              关闭窗口
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
