import { Check, Copy, Loader2, QrCode, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
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
import { Input } from '../../../../../components/ui/input';
import { useQrCodeDisplay } from '../../shared/hooks/use-qr-code-display';

type WechatLoginQrDialogProps = {
  open: boolean;
  blocking: boolean;
  polling: boolean;
  statusLabel: string;
  error: string | null;
  qrDataUrl: string | null;
  expiresIn: number | null;
  verifyCode: string;
  needsVerifyCode: boolean;
  copiedValue: string | null;
  onOpenChange: (open: boolean) => void;
  onVerifyCodeChange: (value: string) => void;
  onGenerate: () => void;
  onSubmitVerifyCode: () => void;
  onCopy: (value: string) => void;
};

export function WechatLoginQrDialog({
  open,
  blocking,
  polling,
  statusLabel,
  error,
  qrDataUrl,
  expiresIn,
  verifyCode,
  needsVerifyCode,
  copiedValue,
  onOpenChange,
  onVerifyCodeChange,
  onGenerate,
  onSubmitVerifyCode,
  onCopy
}: WechatLoginQrDialogProps) {
  const { qrDataUrl: renderedQrDataUrl, timeLeft, isExpired, formatTime } = useQrCodeDisplay({
    open,
    source: qrDataUrl,
    expiresIn,
    loading: blocking
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,28rem)] gap-5 p-6">
        <AlertDialogHeader className="items-center text-center">
          <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold text-[hsl(var(--body-strong))]">
            <QrCode className="h-5 w-5 text-[hsl(var(--primary))]" />
            微信 ClawBot 扫码登录
          </AlertDialogTitle>
          <AlertDialogDescription className="max-w-[320px] text-xs leading-relaxed text-[hsl(var(--muted))]">
            请使用手机微信扫描二维码，按提示完成确认。若出现数字验证码，请输入手机上显示的数字继续绑定。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-[248px] w-[248px] items-center justify-center rounded-3xl border border-[hsl(var(--hairline))] bg-white p-4 shadow-sm">
            {blocking ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--primary))]" />
                <span className="text-[11px] text-[hsl(var(--muted))]">正在同步二维码状态...</span>
              </div>
            ) : renderedQrDataUrl ? (
              <>
                <img
                  src={renderedQrDataUrl}
                  alt="WeChat login QR code"
                  className="h-[208px] w-[208px] rounded-2xl"
                />
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
                    <span className="mt-1 text-[10px] text-[hsl(var(--muted))]">点击重新获取</span>
                  </button>
                ) : null}
              </>
            ) : (
              <div className="flex max-w-[180px] flex-col items-center gap-3 text-center">
                <ShieldAlert className="h-8 w-8 text-[hsl(var(--warning))]" />
                <span className="text-xs text-[hsl(var(--muted))]">
                  {error ?? '尚未生成二维码，请重新发起登录。'}
                </span>
                <Button type="button" variant="secondary" className="h-8 text-[11px]" onClick={onGenerate}>
                  重新生成
                </Button>
              </div>
            )}
          </div>

          {renderedQrDataUrl && !blocking ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[hsl(var(--muted))]">
                <Smartphone className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                <span>{statusLabel}</span>
                {polling ? <Loader2 className="h-3 w-3 animate-spin text-[hsl(var(--primary))]" /> : null}
              </div>
              {timeLeft > 0 ? (
                <span className="text-[11px] text-[hsl(var(--muted))]">
                  请在 <strong className="font-mono text-[hsl(var(--primary))]">{formatTime(timeLeft)}</strong> 内完成操作
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {needsVerifyCode ? (
          <div className="rounded-2xl border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.06)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
              <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
              输入手机上显示的数字验证码
            </div>
            <div className="flex gap-2">
              <Input
                value={verifyCode}
                inputMode="numeric"
                maxLength={8}
                placeholder="例如 2468"
                onChange={(event) => onVerifyCodeChange(event.target.value.replace(/[^\d]/g, ''))}
                className="h-10 bg-white text-sm"
              />
              <Button
                type="button"
                className="h-10 min-w-[96px] text-[11px]"
                disabled={blocking || verifyCode.trim().length === 0}
                onClick={onSubmitVerifyCode}
              >
                提交验证码
              </Button>
            </div>
          </div>
        ) : null}

        {/* {qrDataUrl ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-4 text-[11px] font-medium"
              onClick={() => onCopy(qrDataUrl)}
            >
              {copiedValue === qrDataUrl ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-[hsl(var(--success))]" />
                  已复制扫码链接
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5 text-[hsl(var(--muted))]" />
                  复制扫码链接
                </>
              )}
            </Button>
          </div>
        ) : null} */}

        <AlertDialogFooter>
          <AlertDialogAction className="h-9 w-full text-[11px] font-medium">关闭窗口</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
