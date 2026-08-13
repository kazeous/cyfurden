import type { StorageAssetPurpose } from "@/generated/prisma/client";
import {
  collectFaceboothArtworkObjectKeys,
  parseFaceboothProjectDocument,
  parseFaceboothPublicationDocument,
} from "@/lib/facebooth-documents";
import { authorizeTransactionalPlatformSession } from "@/lib/platform-access";
import { recordPlatformAudit } from "@/lib/platform-audit";
import {
  runSerializableTransaction,
  type TransactionClient,
} from "@/lib/serializable-transaction";

export const STORAGE_RECONCILIATION_PAGE_SIZE = 250;
const RUN_LOCK_PREFIX = "__CYFURDEN_LOCK__:";
const RUN_LOCK_TTL_MS = 10 * 60 * 1_000;

type ReferencedAsset = {
  associatedRecordId: string;
  associatedRecordType: string;
  purpose: StorageAssetPurpose;
};

export type StorageProviderObject = {
  byteLength: bigint;
  objectKey: string;
  verifiedMime: string;
};

export type StorageProviderPage = {
  nextCursor: string | null;
  objects: StorageProviderObject[];
};

export type StorageProviderPageLoader = (input: {
  boothId: string;
  cursor: string | null;
}) => Promise<StorageProviderPage>;

export class StorageReconciliationError extends Error {
  constructor(
    public readonly code:
      | "AUTHORIZATION_DENIED"
      | "INVALID_REASON"
      | "INVALID_TARGET"
      | "TARGET_NOT_FOUND"
      | "RUN_IN_PROGRESS"
      | "PROVIDER_UNAVAILABLE"
      | "RUN_UNAVAILABLE",
  ) {
    super(code);
    this.name = "StorageReconciliationError";
  }
}

function boundedReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 500) {
    throw new StorageReconciliationError("INVALID_REASON");
  }
  return normalized;
}

function boundedBoothId(boothId: string) {
  const normalized = boothId.trim();
  if (!normalized || normalized.length > 240) {
    throw new StorageReconciliationError("INVALID_TARGET");
  }
  return normalized;
}

function runLock(cursor: string | null) {
  return `${RUN_LOCK_PREFIX}${cursor ?? ""}`;
}

function isRunLock(cursor: string | null) {
  return cursor?.startsWith(RUN_LOCK_PREFIX) === true;
}

function cursorFromRunLock(cursor: string) {
  const value = cursor.slice(RUN_LOCK_PREFIX.length);
  return value || null;
}

async function requireStorageOperator(
  transaction: TransactionClient,
  actor: { actorUserId: string; actorSessionId: string },
) {
  const access = await authorizeTransactionalPlatformSession(transaction, {
    userId: actor.actorUserId,
    sessionId: actor.actorSessionId,
    permission: "storage.reconcile",
  });
  if (!access.allowed) {
    throw new StorageReconciliationError("AUTHORIZATION_DENIED");
  }
}

function inferStoragePurpose(objectKey: string): StorageAssetPurpose {
  if (objectKey.includes("/payment/")) return "PAYMENT_QR";
  if (objectKey.includes("/products/")) return "PRODUCT_IMAGE";
  if (objectKey.includes("/facebooth/previews/")) {
    return "FACEBOOTH_PREVIEW";
  }
  if (objectKey.includes("/facebooth/")) return "FACEBOOTH_ARTWORK";
  return "BOOTH_LOGO";
}

function addReference(
  references: Map<string, ReferencedAsset>,
  objectKey: string | null | undefined,
  reference: ReferencedAsset,
) {
  if (objectKey) references.set(objectKey, reference);
}

async function readReferencedAssets(
  transaction: TransactionClient,
  boothId: string,
) {
  const booth = await transaction.booth.findUnique({
    where: { id: boothId },
    select: { id: true, logoObjectKey: true },
  });
  const payment = await transaction.boothPaymentInstruction.findUnique({
    where: { boothId },
    select: { id: true, qrObjectKey: true },
  });
  const productImages = await transaction.productImage.findMany({
    where: { product: { boothId } },
    select: { id: true, objectKey: true },
  });
  const projects = await transaction.faceboothProject.findMany({
    where: { boothId },
    select: {
      id: true,
      kind: true,
      document: true,
      previewObjectKey: true,
    },
  });
  const publication = await transaction.faceboothPublication.findUnique({
    where: { boothId },
    select: { id: true, document: true, previewObjectKey: true },
  });
  if (!booth) throw new StorageReconciliationError("TARGET_NOT_FOUND");

  const references = new Map<string, ReferencedAsset>();
  addReference(references, booth.logoObjectKey, {
    associatedRecordId: booth.id,
    associatedRecordType: "Booth",
    purpose: "BOOTH_LOGO",
  });
  addReference(references, payment?.qrObjectKey, {
    associatedRecordId: payment?.id ?? boothId,
    associatedRecordType: "BoothPaymentInstruction",
    purpose: "PAYMENT_QR",
  });
  for (const image of productImages) {
    addReference(references, image.objectKey, {
      associatedRecordId: image.id,
      associatedRecordType: "ProductImage",
      purpose: "PRODUCT_IMAGE",
    });
  }
  for (const project of projects) {
    const document = parseFaceboothProjectDocument(
      project.kind,
      project.document,
    );
    if (document) {
      for (const objectKey of collectFaceboothArtworkObjectKeys(document)) {
        addReference(references, objectKey, {
          associatedRecordId: project.id,
          associatedRecordType: "FaceboothProject",
          purpose: "FACEBOOTH_ARTWORK",
        });
      }
    }
    addReference(references, project.previewObjectKey, {
      associatedRecordId: project.id,
      associatedRecordType: "FaceboothProject",
      purpose: "FACEBOOTH_PREVIEW",
    });
  }
  if (publication) {
    const document = parseFaceboothPublicationDocument(publication.document);
    if (document) {
      const publishedDocuments = [
        document.scene.document,
        ...document.merch.map((entry) => entry.document),
      ];
      for (const publishedDocument of publishedDocuments) {
        for (const objectKey of collectFaceboothArtworkObjectKeys(
          publishedDocument,
        )) {
          if (!references.has(objectKey)) {
            addReference(references, objectKey, {
              associatedRecordId: publication.id,
              associatedRecordType: "FaceboothPublication",
              purpose: "FACEBOOTH_ARTWORK",
            });
          }
        }
      }
    }
    if (!references.has(publication.previewObjectKey ?? "")) {
      addReference(references, publication.previewObjectKey, {
        associatedRecordId: publication.id,
        associatedRecordType: "FaceboothPublication",
        purpose: "FACEBOOTH_PREVIEW",
      });
    }
  }
  return references;
}

async function markRunFailed(input: {
  actorUserId: string;
  actorSessionId: string;
  boothId: string;
  lockValue: string;
  reason: string;
  runId: string;
}) {
  await runSerializableTransaction(async (transaction) => {
    await requireStorageOperator(transaction, input);
    const failed = await transaction.storageReconciliationRun.updateMany({
      where: {
        id: input.runId,
        status: "RUNNING",
        providerCursor: input.lockValue,
      },
      data: {
        completedAt: new Date(),
        providerCursor: null,
        safeErrorCode: "ORACLE_RECONCILIATION_FAILED",
        status: "FAILED",
      },
    });
    if (failed.count) {
      await recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "storage.reconciliation_failed",
          targetType: "STORAGE_RECONCILIATION",
          targetId: input.boothId,
          reason: input.reason,
          afterMetadata: {
            runId: input.runId,
            safeErrorCode: "ORACLE_RECONCILIATION_FAILED",
          },
        },
        transaction,
      );
    }
  });
}

export async function reconcileBoothStorage(
  input: {
    actorUserId: string;
    actorSessionId: string;
    boothId: string;
    reason: string;
  },
  provider: StorageProviderPageLoader = async (providerInput) => {
    const { loadOracleStoragePage } = await import(
      "@/lib/storage-reconciliation-oracle"
    );
    return loadOracleStoragePage(providerInput);
  },
) {
  const boothId = boundedBoothId(input.boothId);
  const reason = boundedReason(input.reason);
  const claimed = await runSerializableTransaction(async (transaction) => {
    await requireStorageOperator(transaction, input);
    const booth = await transaction.booth.findUnique({
      where: { id: boothId },
      select: { id: true },
    });
    if (!booth) throw new StorageReconciliationError("TARGET_NOT_FOUND");
    const active = await transaction.storageReconciliationRun.findFirst({
      where: { boothId, status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    const claimTime = new Date();
    if (
      active &&
      isRunLock(active.providerCursor) &&
      active.updatedAt.getTime() > claimTime.getTime() - RUN_LOCK_TTL_MS
    ) {
      throw new StorageReconciliationError("RUN_IN_PROGRESS");
    }
    const previousCursor = active?.providerCursor ?? null;
    const cursor =
      active && isRunLock(previousCursor)
        ? cursorFromRunLock(previousCursor!)
        : previousCursor;
    const lockValue = runLock(cursor);
    if (active) {
      const updated = await transaction.storageReconciliationRun.updateMany({
        where: {
          id: active.id,
          status: active.status,
          providerCursor: previousCursor,
        },
        data: {
          providerCursor: lockValue,
          safeErrorCode: null,
          startedAt: active.startedAt ?? claimTime,
          status: "RUNNING",
        },
      });
      if (!updated.count) {
        throw new StorageReconciliationError("RUN_IN_PROGRESS");
      }
      return { cursor, lockValue, runId: active.id };
    }
    const run = await transaction.storageReconciliationRun.create({
      data: {
        boothId,
        requestedByUserId: input.actorUserId,
        providerCursor: lockValue,
        startedAt: new Date(),
        status: "RUNNING",
      },
      select: { id: true },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "storage.reconciliation_started",
        targetType: "STORAGE_RECONCILIATION",
        targetId: boothId,
        reason,
        afterMetadata: { boothId, runId: run.id },
      },
      transaction,
    );
    return { cursor, lockValue, runId: run.id };
  });

  let page: StorageProviderPage;
  try {
    page = await provider({ boothId, cursor: claimed.cursor });
  } catch {
    await markRunFailed({
      ...input,
      lockValue: claimed.lockValue,
      reason,
      runId: claimed.runId,
    });
    throw new StorageReconciliationError("PROVIDER_UNAVAILABLE");
  }
  const uniquePageObjects = [
    ...new Map(page.objects.map((asset) => [asset.objectKey, asset])).values(),
  ];
  if (
    uniquePageObjects.length > STORAGE_RECONCILIATION_PAGE_SIZE ||
    (page.nextCursor !== null &&
      (!page.nextCursor ||
        page.nextCursor.length > 4_096 ||
        /[\u0000-\u001f\u007f]/.test(page.nextCursor))) ||
    uniquePageObjects.some(
      (asset) =>
        asset.byteLength < BigInt(1) ||
        !asset.objectKey.startsWith(`booths/${boothId}/`) ||
        asset.objectKey.length > 1_024 ||
        /[\u0000-\u001f\u007f]/.test(asset.objectKey) ||
        !asset.verifiedMime.trim() ||
        asset.verifiedMime.length > 120 ||
        /[\u0000-\u001f\u007f]/.test(asset.verifiedMime),
    )
  ) {
    await markRunFailed({
      ...input,
      lockValue: claimed.lockValue,
      reason,
      runId: claimed.runId,
    });
    throw new StorageReconciliationError("PROVIDER_UNAVAILABLE");
  }

  return runSerializableTransaction(async (transaction) => {
    await requireStorageOperator(transaction, input);
    const run = await transaction.storageReconciliationRun.findFirst({
      where: {
        id: claimed.runId,
        boothId,
        status: "RUNNING",
        providerCursor: claimed.lockValue,
      },
    });
    if (!run || !run.startedAt) {
      throw new StorageReconciliationError("RUN_UNAVAILABLE");
    }
    const references = await readReferencedAssets(transaction, boothId);
    let pageSizeMismatches = 0;
    const observedAt = new Date();
    for (const asset of uniquePageObjects) {
      const existing = await transaction.storageAsset.findUnique({
        where: { objectKey: asset.objectKey },
        select: { byteLength: true, state: true },
      });
      if (
        existing &&
        existing.state !== "RESERVED" &&
        existing.byteLength !== asset.byteLength
      ) {
        pageSizeMismatches += 1;
      }
      const reference = references.get(asset.objectKey);
      await transaction.storageAsset.upsert({
        where: { objectKey: asset.objectKey },
        create: {
          boothId,
          objectKey: asset.objectKey,
          purpose: reference?.purpose ?? inferStoragePurpose(asset.objectKey),
          byteLength: asset.byteLength,
          verifiedMime: asset.verifiedMime.trim(),
          state: reference ? "VERIFIED" : "ORPHANED",
          associatedRecordType: reference?.associatedRecordType ?? null,
          associatedRecordId: reference?.associatedRecordId ?? null,
          verifiedAt: observedAt,
        },
        update: {
          purpose: reference?.purpose ?? inferStoragePurpose(asset.objectKey),
          byteLength: asset.byteLength,
          verifiedMime: asset.verifiedMime.trim(),
          state: reference ? "VERIFIED" : "ORPHANED",
          associatedRecordType: reference?.associatedRecordType ?? null,
          associatedRecordId: reference?.associatedRecordId ?? null,
          reservationExpiresAt: null,
          verifiedAt: observedAt,
        },
      });
    }

    if (page.nextCursor) {
      await transaction.storageReconciliationRun.update({
        where: { id: run.id },
        data: {
          providerCursor: page.nextCursor,
          sizeMismatchObjectCount: {
            increment: pageSizeMismatches,
          },
        },
      });
      return {
        status: "RUNNING",
        runId: run.id,
        processedObjectCount: uniquePageObjects.length,
      } as const;
    }

    const finalReferences = await readReferencedAssets(transaction, boothId);
    const observedAssets = await transaction.storageAsset.findMany({
      where: { boothId, updatedAt: { gte: run.startedAt } },
      select: { objectKey: true },
    });
    const observedKeys = new Set(
      observedAssets.map((asset) => asset.objectKey),
    );
    for (const [objectKey, reference] of finalReferences) {
      if (observedKeys.has(objectKey)) continue;
      await transaction.storageAsset.upsert({
        where: { objectKey },
        create: {
          boothId,
          objectKey,
          purpose: reference.purpose,
          byteLength: BigInt(1),
          state: "MISSING",
          associatedRecordType: reference.associatedRecordType,
          associatedRecordId: reference.associatedRecordId,
        },
        update: {
          purpose: reference.purpose,
          state: "MISSING",
          associatedRecordType: reference.associatedRecordType,
          associatedRecordId: reference.associatedRecordId,
          reservationExpiresAt: null,
        },
      });
    }
    const absentAssets = await transaction.storageAsset.findMany({
      where: {
        boothId,
        updatedAt: { lt: run.startedAt },
        state: { notIn: ["RESERVED", "DELETED"] },
      },
      select: { id: true, state: true },
    });
    const absentDeletionIds = absentAssets
      .filter((asset) => asset.state === "DELETION_PENDING")
      .map((asset) => asset.id);
    const absentOtherIds = absentAssets
      .filter((asset) => asset.state !== "DELETION_PENDING")
      .map((asset) => asset.id);
    if (absentDeletionIds.length) {
      await transaction.storageAsset.updateMany({
        where: { id: { in: absentDeletionIds } },
        data: { state: "DELETED", deletedAt: observedAt },
      });
    }
    if (absentOtherIds.length) {
      await transaction.storageAsset.updateMany({
        where: { id: { in: absentOtherIds } },
        data: { state: "MISSING" },
      });
    }

    const now = new Date();
    const tracked = await transaction.storageAsset.aggregate({
      where: {
        boothId,
        state: { in: ["VERIFIED", "DETACHED", "DELETION_PENDING"] },
      },
      _count: true,
      _sum: { byteLength: true },
    });
    const reserved = await transaction.storageAsset.aggregate({
      where: {
        boothId,
        state: "RESERVED",
        reservationExpiresAt: { gt: now },
      },
      _count: true,
      _sum: { byteLength: true },
    });
    const untracked = await transaction.storageAsset.aggregate({
      where: { boothId, state: "ORPHANED" },
      _count: true,
      _sum: { byteLength: true },
    });
    const missing = await transaction.storageAsset.count({
      where: { boothId, state: "MISSING" },
    });
    const summary = await transaction.storageReconciliationRun.update({
      where: { id: run.id },
      data: {
        completedAt: now,
        missingObjectCount: missing,
        providerCursor: null,
        reservedBytes: reserved._sum.byteLength ?? BigInt(0),
        reservedObjectCount: reserved._count,
        safeErrorCode: null,
        sizeMismatchObjectCount: {
          increment: pageSizeMismatches,
        },
        status: "COMPLETED",
        trackedBytes: tracked._sum.byteLength ?? BigInt(0),
        trackedObjectCount: tracked._count,
        untrackedBytes: untracked._sum.byteLength ?? BigInt(0),
        untrackedObjectCount: untracked._count,
      },
      select: {
        id: true,
        missingObjectCount: true,
        reservedBytes: true,
        reservedObjectCount: true,
        sizeMismatchObjectCount: true,
        status: true,
        trackedBytes: true,
        trackedObjectCount: true,
        untrackedBytes: true,
        untrackedObjectCount: true,
      },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "storage.reconciliation_completed",
        targetType: "STORAGE_RECONCILIATION",
        targetId: boothId,
        reason,
        afterMetadata: { ...summary, runId: run.id },
      },
      transaction,
    );
    return {
      status: "COMPLETED",
      runId: run.id,
      summary,
    } as const;
  });
}
