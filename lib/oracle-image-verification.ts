import {
  validateProductImageBytes,
  type PaymentQrImage,
} from "@/lib/payment-qr";

export type VerifiedOracleImage = {
  contentTypeMatches: boolean;
  image: PaymentQrImage;
};

/**
 * Inspect bytes downloaded from Oracle instead of trusting the presign request
 * or the object's declared Content-Type metadata.
 */
export function inspectOracleImageBytes(
  bytes: Uint8Array,
  declaredContentType: string | undefined,
): VerifiedOracleImage {
  const image = validateProductImageBytes(bytes);
  return {
    image,
    contentTypeMatches:
      !declaredContentType || declaredContentType === image.contentType,
  };
}
