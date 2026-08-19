import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import { authorizePlatformSession } from "../lib/platform-access";
import {
  cancelPlatformDeletion,
  finalizePlatformOwnershipTransfer,
  PlatformLifecycleError,
  requestPlatformDeletion,
  restorePlatformBooth,
  restorePlatformUser,
  suspendPlatformBooth,
  suspendPlatformUser,
} from "../lib/platform-lifecycle";
import {
  readPlatformAudit,
  readPlatformBoothDetail,
} from "../lib/platform-inventory";
import {
  checkProductQuota,
  updateBoothQuotaOverride,
} from "../lib/platform-quotas";
import {
  assertBoothServiceAccess,
  PlatformTargetError,
} from "../lib/platform-targets";
import { runSerializableTransaction } from "../lib/serializable-transaction";
import { reconcileBoothStorage } from "../lib/storage-reconciliation";

const enabled = process.env.CYFURDEN_PHASE17_INTEGRATION === "1";

type PlatformRole =
  | "PLATFORM_VIEWER"
  | "PLATFORM_OPERATOR"
  | "PLATFORM_SUPER_ADMIN";

async function createPlatformActor(input: {
  id: string;
  now: Date;
  role: PlatformRole;
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
          password: "phase17f-password-hash",
        },
      },
      twoFactors: {
        create: {
          id: `totp-${input.id}`,
          secret: `phase17f-secret-${input.id}`,
          backupCodes: "phase17f-backup-codes",
          verified: true,
        },
      },
      sessions: {
        create: {
          id: sessionId,
          token: `token-${input.id}`,
          expiresAt: new Date(input.now.getTime() + 60 * 60 * 1_000),
          platformAuthenticatedAt: input.now,
        },
      },
      platformRoleGrant: {
        create: {
          role: input.role,
          grantedByUserId: input.id,
          grantReason: "Phase 17F acceptance actor",
        },
      },
    },
  });
  return { actorSessionId: sessionId, actorUserId: input.id };
}

async function createOrdinaryUser(input: {
  id: string;
  now: Date;
  withSession?: boolean;
}) {
  const sessionId = `session-${input.id}`;
  await db.user.create({
    data: {
      id: input.id,
      name: input.id,
      email: `${input.id}@example.com`,
      emailVerified: true,
      sessions: input.withSession
        ? {
            create: {
              id: sessionId,
              token: `token-${input.id}`,
              expiresAt: new Date(input.now.getTime() + 60 * 60 * 1_000),
            },
          }
        : undefined,
    },
  });
  return { sessionId, userId: input.id };
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
        description: input.slug,
        name: input.slug,
        priceCents: BigInt(25_000),
        slug: input.slug,
        tags: [],
      },
    });
    return true;
  });
}

async function cleanup(prefix: string) {
  const booths = await db.booth.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  const boothIds = booths.map(({ id }) => id);
  if (boothIds.length) {
    await db.order.deleteMany({ where: { boothId: { in: boothIds } } });
    await db.booth.deleteMany({ where: { id: { in: boothIds } } });
  }
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
}

test(
  "Phase 17F integrates staged RBAC, lifecycle, quota recovery, storage reconciliation, and audit evidence",
  { skip: !enabled },
  async () => {
    const prefix = `p17f-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const now = new Date();
    try {
      const viewer = await createPlatformActor({
        id: `${prefix}-viewer`,
        now,
        role: "PLATFORM_VIEWER",
      });
      const operator = await createPlatformActor({
        id: `${prefix}-operator`,
        now,
        role: "PLATFORM_OPERATOR",
      });
      const superAdmin = await createPlatformActor({
        id: `${prefix}-super`,
        now,
        role: "PLATFORM_SUPER_ADMIN",
      });
      const owner = await createOrdinaryUser({
        id: `${prefix}-owner`,
        now,
        withSession: true,
      });
      const admin = await createOrdinaryUser({
        id: `${prefix}-admin`,
        now,
        withSession: true,
      });
      const staff = await createOrdinaryUser({
        id: `${prefix}-staff`,
        now,
        withSession: true,
      });
      const target = await createOrdinaryUser({
        id: `${prefix}-target`,
        now,
        withSession: true,
      });

      const migration = await db.$queryRaw<
        Array<{ finished_at: Date | null; migration_name: string }>
      >`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE migration_name = '0014_phase17a_platform_foundation'
      `;
      assert.equal(migration.length, 1);
      assert.ok(migration[0]?.finished_at);

      const booth = await db.booth.create({
        data: {
          name: "Phase 17F integration booth",
          ownerId: owner.userId,
          slug: `${prefix}-main`,
          status: "PUBLISHED",
          memberships: {
            create: [
              { role: "OWNER", status: "ACTIVE", userId: owner.userId },
              { role: "ADMIN", status: "ACTIVE", userId: admin.userId },
              { role: "STAFF", status: "ACTIVE", userId: staff.userId },
            ],
          },
        },
      });
      await db.product.createMany({
        data: [
          {
            boothId: booth.id,
            description: "Phase 17F product A",
            name: "Phase 17F product A",
            priceCents: BigInt(25_000),
            slug: `${prefix}-product-a`,
            tags: [],
          },
          {
            boothId: booth.id,
            description: "Phase 17F product B",
            name: "Phase 17F product B",
            priceCents: BigInt(35_000),
            slug: `${prefix}-product-b`,
            tags: [],
          },
        ],
      });
      const privateCustomerEmail = `${prefix}-customer-private@example.com`;
      const privateTransferReference = `F${prefix.slice(-6)}`;
      await db.order.create({
        data: {
          boothId: booth.id,
          code: `${prefix}-order`,
          customerEmail: privateCustomerEmail,
          customerName: "Private integration customer",
          customerNote: `${prefix}-customer-note-private`,
          idempotencyKey: `${prefix}-idempotency`,
          subtotalCents: BigInt(25_000),
          totalCents: BigInt(25_000),
          transferReference: privateTransferReference,
        },
      });

      for (const ordinary of [owner, admin, staff]) {
        assert.deepEqual(
          await authorizePlatformSession({
            now,
            permission: "platform.read",
            sessionId: ordinary.sessionId,
            userId: ordinary.userId,
          }),
          { allowed: false, reason: "PLATFORM_GRANT_REQUIRED" },
        );
      }
      const viewerRead = await authorizePlatformSession({
        now,
        permission: "platform.read",
        sessionId: viewer.actorSessionId,
        userId: viewer.actorUserId,
      });
      assert.equal(viewerRead.allowed, true);
      const viewerMutation = await authorizePlatformSession({
        now,
        permission: "booth.suspend",
        sessionId: viewer.actorSessionId,
        userId: viewer.actorUserId,
      });
      assert.deepEqual(viewerMutation, {
        allowed: false,
        reason: "PERMISSION_DENIED",
      });
      assert.equal(viewerRead.allowed, true);
      const readOnlyDetail = await readPlatformBoothDetail(
        viewerRead,
        booth.id,
      );
      assert.ok(readOnlyDetail);
      assert.equal(readOnlyDetail.deletionBlockers.retainedOrderReferences, 1);
      assert.doesNotMatch(
        JSON.stringify(readOnlyDetail),
        new RegExp(
          [
            privateCustomerEmail,
            privateTransferReference,
            `${prefix}-customer-note-private`,
          ]
            .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|"),
        ),
      );

      await assert.rejects(
        suspendPlatformUser({
          ...viewer,
          now,
          reason: "Viewer remains read only",
          targetUserId: target.userId,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "AUTHORIZATION_DENIED",
      );
      const suspendedUser = await suspendPlatformUser({
        ...operator,
        now,
        reason: "Phase 17F account suspension check",
        targetUserId: target.userId,
      });
      assert.equal(suspendedUser.revokedSessions, 1);
      assert.equal(
        await db.session.count({ where: { userId: target.userId } }),
        0,
      );
      await restorePlatformUser({
        ...operator,
        now,
        reason: "Phase 17F account restoration check",
        targetUserId: target.userId,
      });

      const suspendedBooth = await suspendPlatformBooth({
        ...operator,
        boothId: booth.id,
        expectedVersion: 1,
        now,
        reason: "Phase 17F booth suspension check",
      });
      assert.equal(suspendedBooth.serviceVersion, 2);
      assert.throws(
        () => assertBoothServiceAccess("SUSPENDED", "PUBLIC_READ"),
        (error) =>
          error instanceof PlatformTargetError &&
          error.code === "BOOTH_UNAVAILABLE",
      );
      assert.throws(
        () => assertBoothServiceAccess("SUSPENDED", "MUTATION"),
        (error) =>
          error instanceof PlatformTargetError &&
          error.code === "BOOTH_READ_ONLY",
      );
      assert.doesNotThrow(() =>
        assertBoothServiceAccess("SUSPENDED", "MEMBER_READ"),
      );
      const restoredBooth = await restorePlatformBooth({
        ...operator,
        boothId: booth.id,
        expectedVersion: 2,
        now,
        reason: "Phase 17F booth restoration check",
      });
      assert.equal(restoredBooth.serviceVersion, 3);

      await updateBoothQuotaOverride({
        ...operator,
        boothId: booth.id,
        maxFaceboothProjects: null,
        maxProducts: 1,
        maxStorageBytes: null,
        maxTeamSeats: null,
        reason: "Phase 17F over-limit check",
      });
      const overLimitDetail = await readPlatformBoothDetail(
        viewerRead,
        booth.id,
      );
      assert.equal(overLimitDetail?.overLimit.products, true);
      assert.equal(
        await createProductWithinQuota({
          boothId: booth.id,
          slug: `${prefix}-product-blocked`,
        }),
        false,
      );
      await updateBoothQuotaOverride({
        ...operator,
        boothId: booth.id,
        maxFaceboothProjects: null,
        maxProducts: 3,
        maxStorageBytes: null,
        maxTeamSeats: null,
        reason: "Phase 17F over-limit recovery",
      });
      assert.equal(
        await createProductWithinQuota({
          boothId: booth.id,
          slug: `${prefix}-product-recovered`,
        }),
        true,
      );

      const orphanObjectKey = `booths/${booth.id}/products/orphan.webp`;
      const reconciliation = await reconcileBoothStorage(
        {
          ...operator,
          boothId: booth.id,
          reason: "Phase 17F bounded storage reconciliation",
        },
        async () => ({
          nextCursor: null,
          objects: [
            {
              byteLength: BigInt(512),
              objectKey: orphanObjectKey,
              verifiedMime: "image/webp",
            },
          ],
        }),
      );
      assert.equal(reconciliation.status, "COMPLETED");
      assert.equal(reconciliation.summary.untrackedObjectCount, 1);
      assert.equal(
        (
          await db.storageAsset.findUniqueOrThrow({
            where: { objectKey: orphanObjectKey },
          })
        ).state,
        "ORPHANED",
      );

      await db.session.update({
        where: { id: superAdmin.actorSessionId },
        data: {
          platformAuthenticatedAt: new Date(now.getTime() - 16 * 60 * 1_000),
        },
      });
      await assert.rejects(
        finalizePlatformOwnershipTransfer({
          ...superAdmin,
          boothId: booth.id,
          confirmation: booth.slug,
          expectedVersion: 3,
          now,
          reason: "Reject stale Phase 17F step-up",
          recipientUserId: admin.userId,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "STEP_UP_REQUIRED",
      );
      await db.session.update({
        where: { id: superAdmin.actorSessionId },
        data: { platformAuthenticatedAt: now },
      });
      const transfer = await finalizePlatformOwnershipTransfer({
        ...superAdmin,
        boothId: booth.id,
        confirmation: booth.slug,
        expectedVersion: 3,
        now,
        reason: "Phase 17F fresh step-up ownership check",
        recipientUserId: admin.userId,
      });
      assert.equal(transfer.serviceVersion, 4);
      const transferred = await db.booth.findUniqueOrThrow({
        where: { id: booth.id },
        include: { memberships: true },
      });
      assert.equal(transferred.ownerId, admin.userId);
      assert.deepEqual(
        transferred.memberships
          .filter(({ role, status }) => role === "OWNER" && status === "ACTIVE")
          .map(({ userId }) => userId),
        [admin.userId],
      );
      assert.equal(
        transferred.memberships.find(({ userId }) => userId === owner.userId)
          ?.role,
        "ADMIN",
      );

      const deletion = await requestPlatformDeletion({
        ...operator,
        expectedVersion: 4,
        now,
        reason: "Phase 17F recoverable deletion check",
        targetId: booth.id,
        targetType: "BOOTH",
      });
      assert.equal(deletion.serviceVersion, 5);
      const cancelled = await cancelPlatformDeletion({
        ...operator,
        expectedVersion: 5,
        now,
        reason: "Phase 17F deletion cancellation check",
        targetId: booth.id,
        targetType: "BOOTH",
      });
      assert.equal(cancelled.serviceVersion, 6);
      assert.equal(
        (await db.booth.findUniqueOrThrow({ where: { id: booth.id } }))
          .serviceState,
        "ACTIVE",
      );

      const auditAccess = await authorizePlatformSession({
        now,
        permission: "audit.read",
        sessionId: viewer.actorSessionId,
        userId: viewer.actorUserId,
      });
      assert.equal(auditAccess.allowed, true);
      const audit = await readPlatformAudit(auditAccess, {
        actor: operator.actorUserId,
      });
      assert.ok(audit.pagination.total >= 10);
      const actions = new Set(audit.audit.map(({ action }) => action));
      assert.ok(actions.has("platform.booth.suspended"));
      assert.ok(actions.has("platform.booth.restored"));
      assert.ok(actions.has("storage.reconciliation_completed"));
      assert.ok(actions.has("platform.deletion.cancelled"));
    } finally {
      await cleanup(prefix);
    }
  },
);
