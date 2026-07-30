import QRCode from "qrcode";

export const socialQrOptions = {
  width: 192,
  margin: 3,
  errorCorrectionLevel: "H",
  color: { dark: "#18233a", light: "#ffffff" },
} as const;

const CENTER_LOGO_RATIO = 0.18;

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return null;
  return await new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function overlayCenterLogo(
  qrDataUrl: string,
  logoUrl: string,
): Promise<string> {
  if (typeof document === "undefined") return qrDataUrl;
  const qrImage = await loadImage(qrDataUrl);
  const logoImage = await loadImage(logoUrl);
  if (!qrImage || !logoImage) return qrDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = qrImage.naturalWidth;
  canvas.height = qrImage.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  ctx.drawImage(qrImage, 0, 0);
  const logoSize = Math.round(canvas.width * CENTER_LOGO_RATIO);
  const offset = Math.round((canvas.width - logoSize) / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(offset - 2, offset - 2, logoSize + 4, logoSize + 4);
  ctx.drawImage(logoImage, offset, offset, logoSize, logoSize);
  return canvas.toDataURL("image/png");
}

export async function createSocialQrDataUrl(
  url: string,
  options?: { centerLogoUrl?: string },
): Promise<string> {
  const base = await QRCode.toDataURL(url, socialQrOptions);
  if (!options?.centerLogoUrl) return base;
  try {
    return await overlayCenterLogo(base, options.centerLogoUrl);
  } catch {
    return base;
  }
}
