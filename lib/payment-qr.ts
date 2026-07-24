export const PAYMENT_QR_MAX_BYTES = 5 * 1024 * 1024;

export const paymentQrAccept = "image/png,image/jpeg,image/webp";
export const PRODUCT_IMAGE_MAX_BYTES = PAYMENT_QR_MAX_BYTES;
export const PRODUCT_IMAGE_MAX_COUNT = 8;
export const productImageAccept = paymentQrAccept;

export type PaymentQrImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

export class PaymentQrValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentQrValidationError";
  }
}

export class ProductImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageValidationError";
  }
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value);

export function validatePaymentQrBytes(bytes: Uint8Array): PaymentQrImage {
  if (bytes.byteLength === 0) {
    throw new PaymentQrValidationError("Choose a QR image to upload.");
  }

  if (bytes.byteLength > PAYMENT_QR_MAX_BYTES) {
    throw new PaymentQrValidationError("QR images must be 5 MB or smaller.");
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { bytes, contentType: "image/png", extension: "png" };
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { bytes, contentType: "image/jpeg", extension: "jpg" };
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { bytes, contentType: "image/webp", extension: "webp" };
  }

  throw new PaymentQrValidationError(
    "Use a PNG, JPEG, or WebP image for the payment QR code.",
  );
}

export function validateProductImageBytes(bytes: Uint8Array): PaymentQrImage {
  try {
    return validatePaymentQrBytes(bytes);
  } catch (error) {
    if (error instanceof PaymentQrValidationError) {
      const message =
        bytes.byteLength > PRODUCT_IMAGE_MAX_BYTES
          ? "Product images must be 5 MB or smaller."
          : bytes.byteLength === 0
            ? "Choose a product image to upload."
            : "Use a PNG, JPEG, or WebP image for the product.";
      throw new ProductImageValidationError(message);
    }
    throw error;
  }
}
