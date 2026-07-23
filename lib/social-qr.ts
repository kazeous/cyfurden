import QRCode from "qrcode";

export const socialQrOptions = {
  width: 192,
  margin: 3,
  errorCorrectionLevel: "H",
  color: { dark: "#18233a", light: "#ffffff" },
} as const;

export function createSocialQrDataUrl(url: string) {
  return QRCode.toDataURL(url, socialQrOptions);
}
