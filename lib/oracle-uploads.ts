import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  PaymentQrValidationError,
  validatePaymentQrBytes,
} from "@/lib/payment-qr";

export type OracleUploadConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
};

export class OracleQrUploadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OracleQrUploadError";
  }
}

const requiredOracleEnvironment = [
  "ORACLE_OBJECT_STORAGE_NAMESPACE",
  "ORACLE_OBJECT_STORAGE_REGION",
  "ORACLE_OBJECT_STORAGE_BUCKET",
  "ORACLE_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ORACLE_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_ORACLE_OBJECT_BASE_URL",
] as const;

export const isOracleQrUploadConfigured = () =>
  requiredOracleEnvironment.every((key) => Boolean(process.env[key]?.trim()));

export function getOracleUploadConfig(): OracleUploadConfig {
  const namespace = process.env.ORACLE_OBJECT_STORAGE_NAMESPACE?.trim();
  const region = process.env.ORACLE_OBJECT_STORAGE_REGION?.trim();
  const bucket = process.env.ORACLE_OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.ORACLE_OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.ORACLE_OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();

  if (!namespace || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new OracleQrUploadError(
      "QR uploads are not configured yet. Ask the site owner to complete Oracle Object Storage setup.",
    );
  }

  return {
    accessKeyId,
    bucket,
    endpoint:
      process.env.ORACLE_OBJECT_STORAGE_S3_ENDPOINT?.trim() ||
      `https://${namespace}.compat.objectstorage.${region}.oci.customer-oci.com`,
    region,
    secretAccessKey,
  };
}

export function createOracleClient(config: OracleUploadConfig) {
  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    region: config.region,
  });
}

export async function uploadPaymentQr({
  boothId,
  file,
}: {
  boothId: string;
  file: File;
}) {
  try {
    const image = validatePaymentQrBytes(
      new Uint8Array(await file.arrayBuffer()),
    );
    const config = getOracleUploadConfig();
    const safeBoothId = boothId.replace(/[^a-zA-Z0-9_-]/g, "");
    const objectKey = `booths/${safeBoothId}/payment/qr-${randomUUID()}.${image.extension}`;

    await createOracleClient(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Body: image.bytes,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
        ContentType: image.contentType,
        Key: objectKey,
      }),
    );

    return objectKey;
  } catch (error) {
    if (error instanceof OracleQrUploadError) throw error;
    if (error instanceof PaymentQrValidationError) {
      throw new OracleQrUploadError(error.message, { cause: error });
    }

    console.error("Oracle payment QR upload failed", error);
    throw new OracleQrUploadError(
      "The QR image could not be uploaded. Check your connection and try again.",
      { cause: error },
    );
  }
}

export async function discardUploadedPaymentQr(objectKey: string) {
  try {
    const config = getOracleUploadConfig();
    await createOracleClient(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
  } catch (error) {
    console.error("Could not discard unattached payment QR upload", error);
  }
}

export async function discardUploadedProductImage(objectKey: string) {
  try {
    const config = getOracleUploadConfig();
    await createOracleClient(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
  } catch (error) {
    console.error("Could not discard unattached product image", error);
  }
}
