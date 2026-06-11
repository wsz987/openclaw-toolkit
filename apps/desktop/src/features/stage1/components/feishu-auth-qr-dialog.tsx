import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, QrCode } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import type { FeishuAuthQrResult } from '../model/types';

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
          width: 240
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,40rem)] gap-5">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-2xl">
            <QrCode className="h-5 w-5 text-[hsl(var(--primary))]" />
            插件授权二维码
          </AlertDialogTitle>
          <AlertDialogDescription>
            这里展示的是根据飞书官方插件 Device Flow 生成的真实授权链接。应用 owner 扫码或点击链接后，即可完成用户级授权。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-4">
            {loading ? (
              <div className="text-center text-xs leading-relaxed text-[hsl(var(--muted))]">正在向飞书申请授权二维码...</div>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="Feishu auth QR code" className="h-[240px] w-[240px] rounded-lg bg-white p-2" />
            ) : (
              <div className="text-center text-xs leading-relaxed text-[hsl(var(--muted))]">
                {error ? '二维码生成失败，请检查 App ID / App Secret。' : '点击下方按钮生成二维码。'}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))]">
              <div className="font-semibold text-[hsl(var(--body-strong))]">核验结果</div>
              <div className="mt-2 space-y-2">
                <div>
                  <strong>结论：</strong>
                  官方插件内部确实使用 OAuth Device Flow 生成授权链接，因此可以稳定转换成二维码展示给用户，无需依赖截图抓取。
                </div>
                <div>
                  <strong>有效期：</strong>
                  {result ? `${Math.max(1, Math.round(result.expiresIn / 60))} 分钟` : '待生成'}
                </div>
                <div>
                  <strong>User Code：</strong>
                  <span className="font-mono">{result?.userCode ?? '待生成'}</span>
                </div>
                <div>
                  <strong>Scope：</strong>
                  <span className="break-all font-mono">{result?.effectiveScope ?? 'offline_access'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] p-4 text-[11px] leading-relaxed text-[hsl(var(--body))]">
              <div className="font-semibold text-[hsl(var(--body-strong))]">打开方式</div>
              <div className="mt-2 break-all font-mono text-[10px]">
                {result?.verificationUriComplete ?? '待生成授权链接'}
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.05)] p-4 text-[11px] leading-relaxed text-[hsl(var(--body-strong))]">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="secondary" onClick={onGenerate} disabled={loading}>
            {loading ? '生成中...' : '重新生成二维码'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => result?.verificationUriComplete && onCopy(result.verificationUriComplete)}
            disabled={!result?.verificationUriComplete}
          >
            {copiedValue === result?.verificationUriComplete ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            复制授权链接
          </Button>
          <Button
            variant="secondary"
            onClick={() => result?.verificationUriComplete && onOpenLink(result.verificationUriComplete)}
            disabled={!result?.verificationUriComplete}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            浏览器打开
          </Button>
          <AlertDialogCancel>关闭</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
