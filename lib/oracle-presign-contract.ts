import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Maximum object size accepted by the protected booth-image upload endpoint. */
export const PRESIGNED_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS = 5 * 60;

export const presignedUploadContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PresignedUploadContentType =
  (typeof presignedUploadContentTypes)[number];
export const presignedUploadPurposes = [
  "logo",
  "design",
  "product",
  "facebooth-artwork",
  "facebooth-preview",
] as const;
export type PresignedUploadPurpose = (typeof presignedUploadPurposes)[number];
export type FaceboothUploadPurpose = "artwork" | "preview";

export const presignedUploadRequestSchema = z
  .object({
    boothId: z.string().trim().min(1).max(64),
    purpose: z.enum(presignedUploadPurposes),
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
  const objectPrefix = {
    logo: "identity/logo",
    design: "identity/design",
    product: "products/image",
    "facebooth-artwork": "facebooth/artwork",
    "facebooth-preview": "facebooth/preview",
  } satisfies Record<PresignedUploadPurpose, string>;
  return `booths/${prefix}/${objectPrefix[purpose]}-${randomUUID()}.${extensionByContentType[contentType]}`;
}

function isBoothUploadObjectKey({
  boothId,
  objectKey,
  prefix,
}: {
  boothId: string;
  objectKey: string;
  prefix: string;
}) {
  const safeBoothId = boothId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeBoothId) return false;
  const boothPrefix = `booths/${safeBoothId}/${prefix}-`;
  return (
    objectKey.startsWith(boothPrefix) &&
    /^[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(objectKey.slice(boothPrefix.length))
  );
}

export function isBoothProductImageObjectKey(
  boothId: string,
  objectKey: string,
) {
  return isBoothUploadObjectKey({
    boothId,
    objectKey,
    prefix: "products/image",
  });
}

export function isBoothFaceboothObjectKey(
  boothId: string,
  purpose: FaceboothUploadPurpose,
  objectKey: string,
) {
  return isBoothUploadObjectKey({
    boothId,
    objectKey,
    prefix: `facebooth/${purpose}`,
  });
}
