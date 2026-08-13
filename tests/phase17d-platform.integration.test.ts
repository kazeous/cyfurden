import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  checkFaceboothProjectQuota,
  checkOwnedBoothQuota,
  checkProductQuota,
  PlatformQuotaMutationError,
  readPlatformQuotaDefaults,
  updateBoothQuotaOverride,
  updatePlatformQuotaDefaults,
  updateUserQuotaOverride,
} from "../lib/platform-quotas";
import { runSerializableTransaction } from "../lib/serializable-transaction";
import {
  recordStorageDeletionResult,
  requestStorageAssetDeletion,
  reserveStorageAsset,
  STORAGE_RESERVATION_TTL_MS,
  StorageLedgerError,
  verifyReservedStorageAsset,
} from "../lib/storage-ledger";
import {
  reconcileBoothStorage,
  StorageReconciliationError,
  type StorageProviderPageLoader,
} from "../lib/storage-reconciliation";
import { createTeamInvitation } from "../lib/team-access";

const enabled = process.env.CYFURDEN_PHASE17D_INTEGRATION === "1";

async function createPlatformActor(input: {
  id: string;
  role: "PLATFORM_VIEWER" | "PLATFORM_OPERATOR";
  now: Date;
}) {
  const sessionId = `session-${input.id}`;
  await db.user.create({
    data: {
      id: input.id,
      name: input.id,
      email: `${input.id}@example.com`,
      emailVerified: true,
      role: input.role,
      twoFactorEnabled: true,
      accounts: {
        create: {
          id: `account-${input.id}`,
          accountId: `${input.id}@example.com`,
          providerId: "credential",
          password: "phase17d-password-hash",
        },
      },
      twoFactors: {
        create: {
          id: `totp-${input.id}`,
          secret: `phase17d-secret-${input.id}`,
          backupCodes: "phase17d-backup-codes",
          verified: true,
        },
      },
      sessions: {
        create: {
          id: sessionId,
          token: `token-${input.id}`,
          expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1_000),
          platformAuthenticatedAt: input.now,
        },
      },
      platformRoleGrant: {
        create: {
          role: input.role,
          grantedByUserId: input.id,
          grantReason: "Phase 17D integration actor",
        },
      },
    },
  });
  return { actorUserId: input.id, actorSessionId: sessionId };
}

async function createOrdinaryUser(id: string) {
  return db.user.create({
    data: {
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
    },
  });
}

async function cleanup(prefix: string) {
  const booths = await db.booth.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  if (booths.length) {
    await db.booth.deleteMany({
      where: { id: { in: booths.map(({ id }) => id) } },
    });
  }
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
}

async function createOwnedBoothWithinQuota(input: {
  ownerId: string;
  slug: string;
}) {
  return runSerializableTransaction(async (transaction) => {
    const quota = await checkOwnedBoothQuota(transaction, input.ownerId);
    if (!quota.allowed) return false;
    await transaction.booth.create({
      data: {
        name: input.slug,
        ownerId: input.ownerId,
        slug: input.slug,
        memberships: {
          create: {
            userId: input.ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
    });
    return true;
  });
}

async function createProductWithinQuota(input: {
  boothId: string;
  slug: string;
}) {
  return runSerializableTransaction(async (transaction) => {
    const quota = await checkProductQuota(transaction, input.boothId);
    if (!quota.allowed) return false;
    await transaction.product.create({
      data: {
        boothId: input.boothId,
        slug: input.slug,
        name: input.slug,
        description: input.slug,
        priceCents: BigInt(10_000),
        tags: [],
      },
    });
    return true;
  });
}

async function createFaceboothWithinQuota(input: {
  actorUserId: string;
  boothId: string;
  name: string;
}) {
  return runSerializableTransaction(async (transaction) => {
    const quota = await checkFaceboothProjectQuota(transaction, input.boothId);
    if (!quota.allowed) return false;
    await transaction.faceboothProject.create({
      data: {
        boothId: input.boothId,
        kind: "MERCH",
        name: input.name,
        document: { version: 1, kind: "MERCH" },
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
    });
    return true;
  });
}

test(
  "Phase 17D atomically enforces typed quota overrides without mutating existing resources",
  { skip: !enabled },
  async () => {
    const prefix = `p17d-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const now = new Date();
    try {
      const operator = await createPlatformActor({
        id: `${prefix}-operator`,
        role: "PLATFORM_OPERATOR",
        now,
      });
      const viewer = await createPlatformActor({
        id: `${prefix}-viewer`,
        role: "PLATFORM_VIEWER",
        now,
      });
      const owner = await createOrdinaryUser(`${prefix}-owner`);

      await assert.rejects(
        updateUserQuotaOverride({
          ...viewer,
          targetUserId: owner.id,
          maxOwnedBooths: 1,
          reason: "Viewer must remain read only",
        }),
        (error) =>
          error instanceof PlatformQuotaMutationError &&
          error.code === "AUTHORIZATION_DENIED",
      );
      const defaults = await readPlatformQuotaDefaults();
      const updatedDefaults = await updatePlatformQuotaDefaults({
        ...operator,
        maxOwnedBooths: defaults.maxOwnedBooths,
        maxTeamSeats: defaults.maxTeamSeats,
        maxProducts: defaults.maxProducts + 1,
        maxFaceboothProjects: defaults.maxFaceboothProjects,
        maxStorageBytes: defaults.maxStorageBytes,
        reason: "Confirm audited typed global defaults",
      });
      assert.equal(updatedDefaults.status, "UPDATED");
      await updatePlatformQuotaDefaults({
        ...operator,
        maxOwnedBooths: defaults.maxOwnedBooths,
        maxTeamSeats: defaults.maxTeamSeats,
        maxProducts: defaults.maxProducts,
        maxFaceboothProjects: defaults.maxFaceboothProjects,
        maxStorageBytes: defaults.maxStorageBytes,
        reason: "Restore approved global defaults after acceptance",
      });
      await updateUserQuotaOverride({
        ...operator,
        targetUserId: owner.id,
        maxOwnedBooths: 1,
        reason: "Bound booth ownership for acceptance",
      });
      const boothAttempts = await Promise.all([
        createOwnedBoothWithinQuota({
          ownerId: owner.id,
          slug: `${prefix}-booth-a`,
        }),
        createOwnedBoothWithinQuota({
          ownerId: owner.id,
          slug: `${prefix}-booth-b`,
        }),
      ]);
      assert.deepEqual(boothAttempts.toSorted(), [false, true]);
      const booth = await db.booth.findFirstOrThrow({
        where: { ownerId: owner.id },
      });

      await updateBoothQuotaOverride({
        ...operator,
        boothId: booth.id,
        maxTeamSeats: 2,
        maxProducts: 1,
        maxFaceboothProjects: 1,
        maxStorageBytes: BigInt(100),
        reason: "Exercise every Phase 17D quota",
      });
      const invitations = await Promise.all([
        createTeamInvitation({
          boothId: booth.id,
          email: `${prefix}-invite-a@example.com`,
          role: "STAFF",
          actorUserId: owner.id,
          token: "a".repeat(64),
          now,
        }),
        createTeamInvitation({
          boothId: booth.id,
          email: `${prefix}-invite-b@example.com`,
          role: "STAFF",
          actorUserId: owner.id,
          token: "b".repeat(64),
          now,
        }),
      ]);
      assert.deepEqual(invitations.map(({ kind }) => kind).toSorted(), [
        "capacity",
        "created",
      ]);

      const productAttempts = await Promise.all([
        createProductWithinQuota({
          boothId: booth.id,
          slug: `${prefix}-product-a`,
        }),
        createProductWithinQuota({
          boothId: booth.id,
          slug: `${prefix}-product-b`,
        }),
      ]);
      assert.deepEqual(productAttempts.toSorted(), [false, true]);
      const faceboothAttempts = await Promise.all([
        createFaceboothWithinQuota({
          actorUserId: owner.id,
          boothId: booth.id,
          name: `${prefix}-facebooth-a`,
        }),
        createFaceboothWithinQuota({
          actorUserId: owner.id,
          boothId: booth.id,
          name: `${prefix}-facebooth-b`,
        }),
      ]);
      assert.deepEqual(faceboothAttempts.toSorted(), [false, true]);

      const storageAttempts = await Promise.allSettled([
        reserveStorageAsset({
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/a.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: 60,
          now,
        }),
        reserveStorageAsset({
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/b.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: 60,
          now,
        }),
      ]);
      assert.equal(
        storageAttempts.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      const rejectedStorage = storageAttempts.find(
        ({ status }) => status === "rejected",
      );
      assert.ok(
        rejectedStorage?.status === "rejected" &&
          rejectedStorage.reason instanceof StorageLedgerError &&
          rejectedStorage.reason.code === "STORAGE_QUOTA_EXCEEDED",
      );
      const reserved = await db.storageAsset.findFirstOrThrow({
        where: { boothId: booth.id, state: "RESERVED" },
      });

      await updateBoothQuotaOverride({
        ...operator,
        boothId: booth.id,
        maxTeamSeats: 1,
        maxProducts: 1,
        maxFaceboothProjects: 1,
        maxStorageBytes: BigInt(1),
        reason: "Confirm below-current limits preserve existing data",
      });
      assert.equal(await db.product.count({ where: { boothId: booth.id } }), 1);
      assert.equal(
        await db.faceboothProject.count({ where: { boothId: booth.id } }),
        1,
      );
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { id: reserved.id },
          })
        ).state,
        "RESERVED",
      );
      await assert.rejects(
        reserveStorageAsset({
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/blocked.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: 1,
          now,
        }),
        (error) =>
          error instanceof StorageLedgerError &&
          error.code === "STORAGE_QUOTA_EXCEEDED",
      );

      await recordStorageDeletionResult({
        deletedObjectKeys: [reserved.objectKey],
        failedObjectKeys: [],
        safeErrorCode: null,
        now,
      });
      await updateBoothQuotaOverride({
        ...operator,
        boothId: booth.id,
        maxTeamSeats: 2,
        maxProducts: 1,
        maxFaceboothProjects: 1,
        maxStorageBytes: BigInt(100),
        reason: "Restore storage after provider-confirmed deletion",
      });
      const recovered = await reserveStorageAsset({
        boothId: booth.id,
        objectKey: `booths/${booth.id}/products/recovered.webp`,
        purpose: "PRODUCT_IMAGE",
        byteLength: 80,
        now,
      });
      const afterReservationExpiry = new Date(
        now.getTime() + STORAGE_RESERVATION_TTL_MS + 1,
      );
      const verifiedKey = `booths/${booth.id}/products/verified.webp`;
      await reserveStorageAsset({
        boothId: booth.id,
        objectKey: verifiedKey,
        purpose: "PRODUCT_IMAGE",
        byteLength: 80,
        now: afterReservationExpiry,
      });
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { id: recovered.id },
          })
        ).state,
        "MISSING",
      );
      const verified = await verifyReservedStorageAsset({
        boothId: booth.id,
        objectKey: verifiedKey,
        purpose: "PRODUCT_IMAGE",
        byteLength: 90,
        verifiedMime: "image/webp",
        now: afterReservationExpiry,
      });
      assert.equal(verified.state, "DETACHED");
      await requestStorageAssetDeletion([verifiedKey], afterReservationExpiry);
      await recordStorageDeletionResult({
        deletedObjectKeys: [],
        failedObjectKeys: [verifiedKey],
        safeErrorCode: "ORACLE_DELETE_FAILED",
        now: afterReservationExpiry,
      });
      await assert.rejects(
        reserveStorageAsset({
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/pending-blocked.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: 11,
          now: afterReservationExpiry,
        }),
        (error) =>
          error instanceof StorageLedgerError &&
          error.code === "STORAGE_QUOTA_EXCEEDED",
      );
      await recordStorageDeletionResult({
        deletedObjectKeys: [verifiedKey],
        failedObjectKeys: [],
        safeErrorCode: null,
        now: afterReservationExpiry,
      });
      await reserveStorageAsset({
        boothId: booth.id,
        objectKey: `booths/${booth.id}/products/released.webp`,
        purpose: "PRODUCT_IMAGE",
        byteLength: 100,
        now: afterReservationExpiry,
      });
      assert.ok(
        (await db.platformAuditLog.count({
          where: {
            actorUserId: operator.actorUserId,
            action: { startsWith: "quota." },
          },
        })) >= 4,
      );
    } finally {
      await cleanup(prefix);
    }
  },
);

test(
  "Phase 17D reconciliation is bounded, idempotent, drift-aware, and failure-safe",
  { skip: !enabled },
  async () => {
    const prefix = `p17r-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const now = new Date();
    try {
      const operator = await createPlatformActor({
        id: `${prefix}-operator`,
        role: "PLATFORM_OPERATOR",
        now,
      });
      const owner = await createOrdinaryUser(`${prefix}-owner`);
      const boothId = `${prefix}-booth`;
      const logoKey = `booths/${boothId}/logo/legacy.webp`;
      const productKey = `booths/${boothId}/products/legacy.webp`;
      const missingQrKey = `booths/${boothId}/payment/missing.png`;
      const orphanKey = `booths/${boothId}/products/orphan.webp`;
      await db.booth.create({
        data: {
          id: boothId,
          slug: `${prefix}-reconcile`,
          name: "Phase 17D reconciliation booth",
          ownerId: owner.id,
          logoObjectKey: logoKey,
          memberships: {
            create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
          },
          paymentInstructions: {
            create: {
              bankName: "",
              accountName: "",
              accountNumber: "",
              instructions: "",
              disclaimer: "",
              qrObjectKey: missingQrKey,
            },
          },
          products: {
            create: {
              slug: `${prefix}-legacy-product`,
              name: "Legacy product",
              description: "Legacy product",
              priceCents: BigInt(10_000),
              tags: [],
              images: {
                create: {
                  objectKey: productKey,
                  alt: "Legacy product",
                },
              },
            },
          },
        },
      });
      const provider: StorageProviderPageLoader = async ({ cursor }) =>
        cursor === null
          ? {
              nextCursor: "page-2",
              objects: [
                {
                  objectKey: logoKey,
                  byteLength: BigInt(10),
                  verifiedMime: "image/webp",
                },
                {
                  objectKey: orphanKey,
                  byteLength: BigInt(7),
                  verifiedMime: "image/webp",
                },
              ],
            }
          : {
              nextCursor: null,
              objects: [
                {
                  objectKey: productKey,
                  byteLength: BigInt(20),
                  verifiedMime: "image/webp",
                },
              ],
            };
      const input = {
        ...operator,
        boothId,
        reason: "Reconcile legacy Oracle objects",
      };
      assert.equal(
        (await reconcileBoothStorage(input, provider)).status,
        "RUNNING",
      );
      const completed = await reconcileBoothStorage(input, provider);
      assert.equal(completed.status, "COMPLETED");
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { objectKey: logoKey },
          })
        ).state,
        "VERIFIED",
      );
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { objectKey: productKey },
          })
        ).byteLength,
        BigInt(20),
      );
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { objectKey: orphanKey },
          })
        ).state,
        "ORPHANED",
      );
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { objectKey: missingQrKey },
          })
        ).state,
        "MISSING",
      );
      const firstAssetCount = await db.storageAsset.count({
        where: { boothId },
      });
      await reconcileBoothStorage(input, provider);
      await reconcileBoothStorage(input, provider);
      assert.equal(
        await db.storageAsset.count({ where: { boothId } }),
        firstAssetCount,
      );

      const beforeFailure = await db.storageAsset.findMany({
        where: { boothId },
        select: { objectKey: true, state: true, byteLength: true },
        orderBy: { objectKey: "asc" },
      });
      await assert.rejects(
        reconcileBoothStorage(input, async () => {
          throw new Error("provider credential detail that must not persist");
        }),
        (error) =>
          error instanceof StorageReconciliationError &&
          error.code === "PROVIDER_UNAVAILABLE",
      );
      assert.deepEqual(
        await db.storageAsset.findMany({
          where: { boothId },
          select: { objectKey: true, state: true, byteLength: true },
          orderBy: { objectKey: "asc" },
        }),
        beforeFailure,
      );
      const failedRun = await db.storageReconciliationRun.findFirstOrThrow({
        where: { boothId },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(failedRun.status, "FAILED");
      assert.equal(failedRun.safeErrorCode, "ORACLE_RECONCILIATION_FAILED");

      let enterProvider!: () => void;
      let releaseProvider!: (
        page: Awaited<ReturnType<StorageProviderPageLoader>>,
      ) => void;
      const entered = new Promise<void>((resolve) => {
        enterProvider = resolve;
      });
      const blockedProvider = new Promise<
        Awaited<ReturnType<StorageProviderPageLoader>>
      >((resolve) => {
        releaseProvider = resolve;
      });
      const concurrentRun = reconcileBoothStorage(input, async () => {
        enterProvider();
        return blockedProvider;
      });
      await entered;
      await assert.rejects(
        reconcileBoothStorage(input, provider),
        (error) =>
          error instanceof StorageReconciliationError &&
          error.code === "RUN_IN_PROGRESS",
      );
      releaseProvider({
        nextCursor: null,
        objects: [
          {
            objectKey: logoKey,
            byteLength: BigInt(10),
            verifiedMime: "image/webp",
          },
          {
            objectKey: productKey,
            byteLength: BigInt(20),
            verifiedMime: "image/webp",
          },
          {
            objectKey: orphanKey,
            byteLength: BigInt(7),
            verifiedMime: "image/webp",
          },
        ],
      });
      assert.equal((await concurrentRun).status, "COMPLETED");
      assert.ok(
        (await db.platformAuditLog.count({
          where: {
            actorUserId: operator.actorUserId,
            targetType: "STORAGE_RECONCILIATION",
            targetId: boothId,
          },
        })) >= 5,
      );
    } finally {
      await cleanup(prefix);
    }
  },
);
