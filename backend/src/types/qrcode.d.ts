declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: { margin?: number; width?: number },
  ): Promise<string>;

  const QRCode: {
    toDataURL: typeof toDataURL;
  };

  export default QRCode;
}
