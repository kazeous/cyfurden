import { requireBoothServiceAccess } from "@/lib/platform-targets";
import { db } from "@/lib/db";
import { readEffectiveBoothQuotas } from "@/lib/platform-quotas";
import {
  runSerializableTransaction,
  type TransactionClient,
} from "@/lib/serializable-transaction";

export const STORAGE_RESERVATION_TTL_MS = 5 * 60 * 1_000;

const COUNTED_STORAGE_STATES = [
  "VERIFIED",
  "DETACHED",
  "DELETION_PENDING",
] as const;

export type StorageLedgerPurpose =
  | "BOOTH_LOGO"
  | "PAYMENT_QR"
  | "PRODUCT_IMAGE"
  | "FACEBOOTH_ARTWORK"
  | "FACEBOOTH_PREVIEW";

export class StorageLedgerError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ASSET"
      | "STORAGE_QUOTA_EXCEEDED"
      | "TARGET_UNAVAILABLE",
    public readonly limit?: bigint,
  ) {
    super(code);
    this.name = "StorageLedgerError";
  }
}

export function storagePurposeForPresign(
  purpose:
    | "logo"
    | "design"
    | "product"
    | "facebooth-artwork"
    | "facebooth-preview",
): StorageLedgerPurpose {
  return (
    {
      logo: "BOOTH_LOGO",
      design: "BOOTH_LOGO",
      product: "PRODUCT_IMAGE",
      "facebooth-artwork": "FACEBOOTH_ARTWORK",
      "facebooth-preview": "FACEBOOTH_PREVIEW",
    } as const
  )[purpose];
}

function validObjectKey(boothId: string, objectKey: string) {
  return (
    objectKey.length >= 1 &&
    objectKey.length <= 1_024 &&
    objectKey.startsWith(`booths/${boothId}/`) &&
    !/[\u0000-\u001f\u007f]/.test(objectKey)
  );
}

async function expireStaleReservations(
  transaction: TransactionClient,
  boothId: string,
  now: Date,
) {
  await transaction.storageAsset.updateMany({
    where: {
      boothId,
      state: "RESERVED",
      reservationExpiresAt: { lte: now },
    },
    data: { state: "MISSING" },
  });
}

export async function expireStaleStorageReservations(
  boothId?: string,
  now = new Date(),
) {
  return db.storageAsset.updateMany({
    where: {
      ...(boothId ? { boothId } : {}),
      state: "RESERVED",
      reservationExpiresAt: { lte: now },
    },
    data: { state: "MISSING" },
  });
}

export async function readCountedStorageBytes(
  transaction: TransactionClient,
  boothId: string,
  now = new Date(),
  excludeAssetId?: string,
) {
  const result = await transaction.storageAsset.aggregate({
    where: {
      boothId,
      ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
      OR: [
        { state: { in: [...COUNTED_STORAGE_STATES] } },
        { state: "RESERVED", reservationExpiresAt: { gt: now } },
      ],
    },
    _sum: { byteLength: true },
  });
  return result._sum.byteLength ?? BigInt(0);
}

export async function reserveStorageAsset(input: {
  boothId: string;
  objectKey: string;
  purpose: StorageLedgerPurpose;
  byteLength: number | bigint;
  now?: Date;
}) {
  const byteLength = BigInt(input.byteLength);
  if (
    byteLength < BigInt(1) ||
    !validObjectKey(input.boothId, input.objectKey)
  ) {
    throw new StorageLedgerError("INVALID_ASSET");
  }
  const now = input.now ?? new Date();

  return runSerializableTransaction(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    await expireStaleReservations(transaction, input.boothId, now);
    const quota = await readEffectiveBoothQuotas(transaction, input.boothId);
    const usage = await readCountedStorageBytes(
      transaction,
      input.boothId,
      now,
    );
    if (usage + byteLength > quota.maxStorageBytes) {
      throw new StorageLedgerError(
        "STORAGE_QUOTA_EXCEEDED",
        quota.maxStorageBytes,
      );
    }
    return transaction.storageAsset.create({
      data: {
        boothId: input.boothId,
        objectKey: input.objectKey,
        purpose: input.purpose,
        byteLength,
        state: "RESERVED",
        reservationExpiresAt: new Date(
          now.getTime() + STORAGE_RESERVATION_TTL_MS,
        ),
      },
      select: {
        id: true,
        objectKey: true,
        reservationExpiresAt: true,
      },
    });
  });
}

export async function cancelStorageReservation(
  boothId: string,
  objectKey: string,
  now = new Date(),
) {
  await runSerializableTransaction(async (transaction) => {
    await transaction.storageAsset.updateMany({
      where: { boothId, objectKey, state: "RESERVED" },
      data: {
        state: "DELETED",
        deletedAt: now,
        reservationExpiresAt: null,
      },
    });
  });
}

export async function verifyReservedStorageAsset(input: {
  boothId: string;
  objectKey: string;
  purpose: StorageLedgerPurpose;
  byteLength: number | bigint;
  verifiedMime: string;
  now?: Date;
}) {
  const byteLength = BigInt(input.byteLength);
  const verifiedMime = input.verifiedMime.trim().slice(0, 120);
  if (
    byteLength < BigInt(1) ||
    !verifiedMime ||
    !validObjectKey(input.boothId, input.objectKey)
  ) {
    throw new StorageLedgerError("INVALID_ASSET");
  }
  const now = input.now ?? new Date();

  return runSerializableTransaction(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    await expireStaleReservations(transaction, input.boothId, now);
    const asset = await transaction.storageAsset.findUnique({
      where: { objectKey: input.objectKey },
      select: { id: true, boothId: true, state: true },
    });
    if (
      asset &&
      (asset.boothId !== input.boothId || asset.state === "DELETED")
    ) {
      throw new StorageLedgerError("INVALID_ASSET");
    }
    const quota = await readEffectiveBoothQuotas(transaction, input.boothId);
    const otherUsage = await readCountedStorageBytes(
      transaction,
      input.boothId,
      now,
      asset?.id,
    );
    if (otherUsage + byteLength > quota.maxStorageBytes) {
      throw new StorageLedgerError(
        "STORAGE_QUOTA_EXCEEDED",
        quota.maxStorageBytes,
      );
    }
    const data = {
      byteLength,
      verifiedMime,
      state: "DETACHED",
      reservationExpiresAt: null,
      verifiedAt: now,
    } as const;
    return asset
      ? transaction.storageAsset.update({
          where: { id: asset.id },
          data,
          select: { id: true, objectKey: true, state: true },
        })
      : transaction.storageAsset.create({
          data: {
            boothId: input.boothId,
            objectKey: input.objectKey,
            purpose: input.purpose,
            ...data,
          },
          select: { id: true, objectKey: true, state: true },
        });
  });
}

export async function attachStorageAssets(
  transaction: TransactionClient,
  input: {
    boothId: string;
    objectKeys: Iterable<string>;
    associatedRecordType: string;
    associatedRecordId: string;
  },
) {
  const objectKeys = [...new Set(input.objectKeys)];
  if (!objectKeys.length) return;
  await transaction.storageAsset.updateMany({
    where: {
      boothId: input.boothId,
      objectKey: { in: objectKeys },
      state: { in: ["VERIFIED", "DETACHED"] },
    },
    data: {
      state: "VERIFIED",
      associatedRecordType: input.associatedRecordType.slice(0, 120),
      associatedRecordId: input.associatedRecordId.slice(0, 240),
      detachedAt: null,
    },
  });
}

export async function detachStorageAssets(
  transaction: TransactionClient,
  input: {
    boothId: string;
    objectKeys: Iterable<string>;
    now?: Date;
    associatedRecordType?: string;
    associatedRecordId?: string;
  },
) {
  const objectKeys = [...new Set(input.objectKeys)];
  if (!objectKeys.length) return;
  await transaction.storageAsset.updateMany({
    where: {
      boothId: input.boothId,
      objectKey: { in: objectKeys },
      state: "VERIFIED",
      ...(input.associatedRecordType
        ? { associatedRecordType: input.associatedRecordType.slice(0, 120) }
        : {}),
      ...(input.associatedRecordId
        ? { associatedRecordId: input.associatedRecordId.slice(0, 240) }
        : {}),
    },
    data: {
      state: "DETACHED",
      associatedRecordType: null,
      associatedRecordId: null,
      detachedAt: input.now ?? new Date(),
    },
  });
}

export async function requestStorageAssetDeletion(
  objectKeys: Iterable<string>,
  now = new Date(),
) {
  const keys = [...new Set(objectKeys)];
  if (!keys.length) return;
  await runSerializableTransaction(async (transaction) => {
    await transaction.storageAsset.updateMany({
      where: {
        objectKey: { in: keys },
        state: { in: ["VERIFIED", "DETACHED"] },
      },
      data: {
        state: "DELETION_PENDING",
        deletionRequestedAt: now,
      },
    });
  });
}

export async function recordStorageDeletionResult(input: {
  deletedObjectKeys: Iterable<string>;
  failedObjectKeys: Iterable<string>;
  safeErrorCode: string | null;
  now?: Date;
}) {
  const deleted = [...new Set(input.deletedObjectKeys)];
  const failed = [...new Set(input.failedObjectKeys)];
  const now = input.now ?? new Date();
  await runSerializableTransaction(async (transaction) => {
    if (deleted.length) {
      await transaction.storageAsset.updateMany({
        where: { objectKey: { in: deleted } },
        data: {
          state: "DELETED",
          deletedAt: now,
          reservationExpiresAt: null,
          deletionAttempts: { increment: 1 },
          lastDeletionErrorCode: null,
        },
      });
    }
    if (failed.length) {
      await transaction.storageAsset.updateMany({
        where: {
          objectKey: { in: failed },
          verifiedAt: { not: null },
          verifiedMime: { not: null },
        },
        data: {
          state: "DELETION_PENDING",
          deletionRequestedAt: now,
          deletionAttempts: { increment: 1 },
          lastDeletionErrorCode: input.safeErrorCode ?? "ORACLE_DELETE_FAILED",
        },
      });
    }
  });
}
