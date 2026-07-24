import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Maximum object size accepted by the protected booth-image upload endpoint. */
export const PRESIGNED_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS = 5 * 60;

export const presignedUploadContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PresignedUploadContentType =
  (typeof presignedUploadContentTypes)[number];
export type PresignedUploadPurpose = "logo" | "design" | "product";

export const presignedUploadRequestSchema = z
  .object({
    boothId: z.string().trim().min(1).max(64),
    purpose: z.enum(["logo", "design", "product"]),
    contentType: z.enum(presignedUploadContentTypes),
    contentLength: z.number().int().positive().max(PRESIGNED_UPLOAD_MAX_BYTES),
  })
  .strict();

const extensionByContentType: Record<PresignedUploadContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Build an object key that cannot escape the booth prefix or reveal a caller's
 * filename. The UUID makes every request address a new object, including
 * replacements of an existing logo.
 */
export function buildBoothUploadObjectKey({
  boothId,
  purpose,
  contentType,
}: {
  boothId: string;
  purpose: PresignedUploadPurpose;
  contentType: PresignedUploadContentType;
}) {
  const safeBoothId = boothId.replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = safeBoothId || "unknown";
  const objectPrefix =
    purpose === "logo"
      ? "identity/logo"
      : purpose === "product"
        ? "products/image"
        : "identity/design";
  return `booths/${prefix}/${objectPrefix}-${randomUUID()}.${extensionByContentType[contentType]}`;
}

export function isBoothProductImageObjectKey(
  boothId: string,
  objectKey: string,
) {
  const safeBoothId = boothId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeBoothId) return false;
  const prefix = `booths/${safeBoothId}/products/image-`;
  return (
    objectKey.startsWith(prefix) &&
    /^[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(objectKey.slice(prefix.length))
  );
}
