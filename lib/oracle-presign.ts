import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import {
  buildBoothUploadObjectKey,
  isBoothProductImageObjectKey,
  PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS,
  presignedUploadRequestSchema,
} from "@/lib/oracle-presign-contract";
import {
  createOracleClient,
  getOracleUploadConfig,
} from "@/lib/oracle-uploads";
import {
  ProductImageValidationError,
  validateProductImageBytes,
} from "@/lib/payment-qr";
import { isBoothLogoObjectKey } from "@/lib/shop-settings";

export { presignedUploadRequestSchema } from "@/lib/oracle-presign-contract";

export class OracleLogoVerificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OracleLogoVerificationError";
  }
}

export class OracleProductImageVerificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OracleProductImageVerificationError";
  }
}

export async function createBoothUploadPresign({
  boothId,
  purpose,
  contentType,
  contentLength,
}: z.infer<typeof presignedUploadRequestSchema>) {
  const config = getOracleUploadConfig();
  const objectKey = buildBoothUploadObjectKey({
    boothId,
    purpose,
    contentType,
  });

  const uploadUrl = await getSignedUrl(
    createOracleClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      ContentLength: contentLength,
      ContentType: contentType,
      Key: objectKey,
    }),
    { expiresIn: PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS },
  );

  return {
    objectKey,
    uploadUrl,
    expiresIn: PRESIGNED_UPLOAD_EXPIRES_IN_SECONDS,
    headers: {
      "content-length": String(contentLength),
      "content-type": contentType,
    },
  };
}

export async function verifyBoothLogoUpload({
  boothId,
  objectKey,
}: {
  boothId: string;
  objectKey: string;
}) {
  if (!isBoothLogoObjectKey(boothId, objectKey)) {
    throw new OracleLogoVerificationError(
      "The uploaded logo does not belong to this booth.",
    );
  }

  try {
    const config = getOracleUploadConfig();
    const result = await createOracleClient(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
    if (!result.Body) {
      throw new OracleLogoVerificationError(
        "The uploaded logo could not be read from object storage.",
      );
    }
    const image = validateProductImageBytes(
      new Uint8Array(await result.Body.transformToByteArray()),
    );
    if (result.ContentType && result.ContentType !== image.contentType) {
      throw new OracleLogoVerificationError(
        "The uploaded logo content does not match its image type.",
      );
    }
    return objectKey;
  } catch (error) {
    if (error instanceof OracleLogoVerificationError) throw error;
    if (error instanceof ProductImageValidationError) {
      throw new OracleLogoVerificationError(error.message, { cause: error });
    }
    console.error("Oracle booth logo verification failed", error);
    throw new OracleLogoVerificationError(
      "The uploaded logo could not be verified. Upload it again.",
      { cause: error },
    );
  }
}

export async function verifyBoothProductImageUpload({
  boothId,
  objectKey,
}: {
  boothId: string;
  objectKey: string;
}) {
  if (!isBoothProductImageObjectKey(boothId, objectKey)) {
    throw new OracleProductImageVerificationError(
      "The uploaded product image does not belong to this booth.",
    );
  }

  try {
    const config = getOracleUploadConfig();
    const result = await createOracleClient(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
    if (!result.Body) {
      throw new OracleProductImageVerificationError(
        "The uploaded product image could not be read from object storage.",
      );
    }
    const image = validateProductImageBytes(
      new Uint8Array(await result.Body.transformToByteArray()),
    );
    if (result.ContentType && result.ContentType !== image.contentType) {
      throw new OracleProductImageVerificationError(
        "The uploaded product image does not match its declared image type.",
      );
    }
    return objectKey;
  } catch (error) {
    if (error instanceof OracleProductImageVerificationError) throw error;
    if (error instanceof ProductImageValidationError) {
      throw new OracleProductImageVerificationError(error.message, {
        cause: error,
      });
    }
    console.error("Oracle product image verification failed", error);
    throw new OracleProductImageVerificationError(
      "The uploaded product image could not be verified. Upload it again.",
      { cause: error },
    );
  }
}
