declare module 'qrcode' {
  export type QRCodeToDataURLOptions = {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    width?: number;
  };

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
