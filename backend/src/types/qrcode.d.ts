declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: { margin?: number; width?: number },
  ): Promise<string>;

  export function create(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
  ): {
    modules: {
      size: number;
      get(row: number, col: number): boolean;
    };
  };

  const QRCode: {
    toDataURL: typeof toDataURL;
    create: typeof create;
  };

  export default QRCode;
}
