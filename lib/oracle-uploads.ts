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
import { requireBoothServiceAccess } from "@/lib/platform-targets";
import {
  recordStorageDeletionResult,
  requestStorageAssetDeletion,
  reserveStorageAsset,
  StorageLedgerError,
  verifyReservedStorageAsset,
} from "@/lib/storage-ledger";

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
  let reservedObjectKey: string | null = null;
  try {
    await requireBoothServiceAccess(boothId, "MUTATION");
    const image = validatePaymentQrBytes(
      new Uint8Array(await file.arrayBuffer()),
    );
    const config = getOracleUploadConfig();
    const safeBoothId = boothId.replace(/[^a-zA-Z0-9_-]/g, "");
    const objectKey = `booths/${safeBoothId}/payment/qr-${randomUUID()}.${image.extension}`;
    await reserveStorageAsset({
      boothId,
      objectKey,
      purpose: "PAYMENT_QR",
      byteLength: image.bytes.byteLength,
    });
    reservedObjectKey = objectKey;

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
    await verifyReservedStorageAsset({
      boothId,
      objectKey,
      purpose: "PAYMENT_QR",
      byteLength: image.bytes.byteLength,
      verifiedMime: image.contentType,
    });

    return objectKey;
  } catch (error) {
    if (reservedObjectKey) {
      const deletion = await deleteOracleObjectsStrict([reservedObjectKey]);
      await recordStorageDeletionResult(deletion);
    }
    if (error instanceof OracleQrUploadError) throw error;
    if (
      error instanceof StorageLedgerError &&
      error.code === "STORAGE_QUOTA_EXCEEDED"
    ) {
      throw new OracleQrUploadError(
        "This booth has reached its storage quota. Remove unused media or ask a platform operator to raise it.",
        { cause: error },
      );
    }
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
  await requestStorageAssetDeletion([objectKey]);
  const result = await deleteOracleObjectsStrict([objectKey]);
  await recordStorageDeletionResult(result);
  if (result.failedObjectKeys.length) {
    console.error("Could not discard unattached payment QR upload", {
      code: result.safeErrorCode,
    });
  }
  return result;
}

export async function discardUploadedProductImage(objectKey: string) {
  await requestStorageAssetDeletion([objectKey]);
  const result = await deleteOracleObjectsStrict([objectKey]);
  await recordStorageDeletionResult(result);
  if (result.failedObjectKeys.length) {
    console.error("Could not discard unattached product image", {
      code: result.safeErrorCode,
    });
  }
  return result;
}

export type OracleDeletionResult = {
  deletedObjectKeys: string[];
  failedObjectKeys: string[];
  safeErrorCode: "ORACLE_DELETE_FAILED" | "ORACLE_NOT_CONFIGURED" | null;
};

export async function deleteOracleObjectsStrict(
  objectKeys: Iterable<string>,
): Promise<OracleDeletionResult> {
  const uniqueKeys = [
    ...new Set(
      [...objectKeys]
        .map((objectKey) => objectKey.trim())
        .filter(
          (objectKey) =>
            objectKey.length > 0 &&
            objectKey.length <= 1_024 &&
            !/[\u0000-\u001f\u007f]/.test(objectKey),
        ),
    ),
  ];
  if (!uniqueKeys.length) {
    return {
      deletedObjectKeys: [],
      failedObjectKeys: [],
      safeErrorCode: null,
    };
  }

  let config: OracleUploadConfig;
  try {
    config = getOracleUploadConfig();
  } catch {
    return {
      deletedObjectKeys: [],
      failedObjectKeys: uniqueKeys,
      safeErrorCode: "ORACLE_NOT_CONFIGURED",
    };
  }

  const client = createOracleClient(config);
  const deletedObjectKeys: string[] = [];
  const failedObjectKeys: string[] = [];
  for (const objectKey of uniqueKeys) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
      );
      deletedObjectKeys.push(objectKey);
    } catch {
      failedObjectKeys.push(objectKey);
    }
  }

  return {
    deletedObjectKeys,
    failedObjectKeys,
    safeErrorCode: failedObjectKeys.length ? "ORACLE_DELETE_FAILED" : null,
  };
}
