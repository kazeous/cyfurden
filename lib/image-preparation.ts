export const ORDINARY_IMAGE_LONGEST_EDGE = 2_560;
export const OPAQUE_WEBP_QUALITY = 92;

type PixelData = {
  data: Uint8ClampedArray;
  height: number;
  width: number;
};

export type PreparedImageDimensions = {
  height: number;
  width: number;
};

export class ImagePreparationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImagePreparationError";
  }
}

export function calculatePreparedImageDimensions(
  width: number,
  height: number,
  longestEdge = ORDINARY_IMAGE_LONGEST_EDGE,
): PreparedImageDimensions {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(longestEdge) ||
    longestEdge <= 0
  ) {
    throw new ImagePreparationError("The image dimensions are invalid.");
  }

  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function imageHasTransparency(image: PixelData) {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] !== 255) return true;
  }
  return false;
}

function outputName(name: string, extension: "png" | "webp") {
  const base = name.replace(/\.[^.]+$/, "").trim() || "image";
  return `${base}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImagePreparationError("The image could not be encoded."));
    }, type);
  });
}

async function decodeImage(file: File) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeDecodedImage(image: ImageBitmap | HTMLImageElement) {
  if ("close" in image && typeof image.close === "function") image.close();
}

async function encodeWebp(imageData: ImageData, lossless: boolean) {
  const { default: encode } = await import("@jsquash/webp/encode.js");
  const bytes = await encode(imageData, {
    exact: lossless ? 1 : 0,
    lossless: lossless ? 1 : 0,
    method: 4,
    near_lossless: 100,
    quality: OPAQUE_WEBP_QUALITY,
  });
  return new Blob([bytes], { type: "image/webp" });
}

/**
 * Re-encodes an ordinary booth/product image in the browser. Drawing through
 * canvas drops source metadata, including EXIF location, while preserving the
 * decoded orientation and aspect ratio.
 */
export async function prepareOrdinaryImage(
  file: File,
  finalMaxBytes: number,
): Promise<File> {
  let decoded: ImageBitmap | HTMLImageElement;
  try {
    decoded = await decodeImage(file);
  } catch (error) {
    throw new ImagePreparationError("The selected image could not be read.", {
      cause: error,
    });
  }

  try {
    const sourceWidth =
      "naturalWidth" in decoded ? decoded.naturalWidth : decoded.width;
    const sourceHeight =
      "naturalHeight" in decoded ? decoded.naturalHeight : decoded.height;
    const { width, height } = calculatePreparedImageDimensions(
      sourceWidth,
      sourceHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });
    if (!context) {
      throw new ImagePreparationError("This browser cannot prepare images.");
    }
    context.drawImage(decoded, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const transparent = imageHasTransparency(imageData);

    let blob: Blob;
    let extension: "png" | "webp";
    if (transparent) {
      const png = await canvasToBlob(canvas, "image/png");
      if (png.size <= finalMaxBytes) {
        blob = png;
        extension = "png";
      } else {
        blob = await encodeWebp(imageData, true);
        extension = "webp";
      }
    } else {
      blob = await encodeWebp(imageData, false);
      extension = "webp";
    }

    if (blob.size === 0 || blob.size > finalMaxBytes) {
      throw new ImagePreparationError(
        "The prepared image is still larger than the upload limit.",
      );
    }
    return new File([blob], outputName(file.name, extension), {
      lastModified: Date.now(),
      type: blob.type,
    });
  } catch (error) {
    if (error instanceof ImagePreparationError) throw error;
    throw new ImagePreparationError(
      "The selected image could not be prepared.",
      {
        cause: error,
      },
    );
  } finally {
    closeDecodedImage(decoded);
  }
}
