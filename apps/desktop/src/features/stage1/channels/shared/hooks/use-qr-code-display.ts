import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type UseQrCodeDisplayOptions = {
  open: boolean;
  source: string | null;
  expiresIn: number | null;
  loading?: boolean;
};

type UseQrCodeDisplayResult = {
  qrDataUrl: string | null;
  timeLeft: number;
  isExpired: boolean;
  formatTime: (seconds: number) => string;
};

export function useQrCodeDisplay({
  open,
  source,
  expiresIn,
  loading = false
}: UseQrCodeDisplayOptions): UseQrCodeDisplayResult {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    let disposed = false;

    async function renderQrCode() {
      if (!source) {
        setQrDataUrl(null);
        return;
      }

      if (source.startsWith('data:image/')) {
        setQrDataUrl(source);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(source, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 208
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
  }, [source]);

  useEffect(() => {
    if (open && expiresIn) {
      setTimeLeft(expiresIn);
    } else if (!open) {
      setTimeLeft(0);
    }
  }, [expiresIn, open, source]);

  useEffect(() => {
    if (!open || loading || timeLeft <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading, open, timeLeft]);

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return {
    qrDataUrl,
    timeLeft,
    isExpired: !loading && qrDataUrl !== null && timeLeft <= 0,
    formatTime
  };
}
