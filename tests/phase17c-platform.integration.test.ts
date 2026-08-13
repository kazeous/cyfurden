import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  cancelPlatformDeletion,
  finalizePlatformBoothDeletion,
  finalizePlatformOwnershipTransfer,
  finalizePlatformUserDeletion,
  PlatformLifecycleError,
  previewPlatformOwnershipTransfer,
  requestPlatformDeletion,
  restorePlatformBooth,
  restorePlatformUser,
  restrictPlatformMembership,
  revokePlatformUserSessions,
  suspendPlatformBooth,
  suspendPlatformUser,
} from "../lib/platform-lifecycle";
import {
  assertBoothServiceAccess,
  PlatformTargetError,
} from "../lib/platform-targets";
import { createTeamInvitation } from "../lib/team-access";

const enabled = process.env.CYFURDEN_PHASE17C_INTEGRATION === "1";

async function createPlatformActor(input: {
  id: string;
  role: "PLATFORM_VIEWER" | "PLATFORM_OPERATOR" | "PLATFORM_SUPER_ADMIN";
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
          password: "phase17c-password-hash",
        },
      },
      twoFactors: {
        create: {
          id: `totp-${input.id}`,
          secret: `phase17c-secret-${input.id}`,
          backupCodes: "phase17c-backup-codes",
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
          grantReason: "Phase 17C integration actor",
        },
      },
    },
  });
  return {
    actorUserId: input.id,
    actorSessionId: sessionId,
  };
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
  const boothIds = booths.map(({ id }) => id);
  if (boothIds.length) {
    await db.order.deleteMany({ where: { boothId: { in: boothIds } } });
    await db.booth.deleteMany({ where: { id: { in: boothIds } } });
  }
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
}

test(
  "Phase 17C enforces user, booth, membership, ownership, and freeze transitions",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const prefix = `p17c-${suffix.slice(0, 12)}`;
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
      const superAdmin = await createPlatformActor({
        id: `${prefix}-super`,
        role: "PLATFORM_SUPER_ADMIN",
        now,
      });
      await createPlatformActor({
        id: `${prefix}-super2`,
        role: "PLATFORM_SUPER_ADMIN",
        now,
      });
      const owner = await createOrdinaryUser(`${prefix}-owner`);
      const recipient = await createOrdinaryUser(`${prefix}-recipient`);
      const target = await createOrdinaryUser(`${prefix}-target`);
      await db.session.createMany({
        data: [
          {
            id: `${prefix}-target-session-1`,
            token: `${prefix}-target-token-1`,
            userId: target.id,
            expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
          },
          {
            id: `${prefix}-target-session-2`,
            token: `${prefix}-target-token-2`,
            userId: target.id,
            expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
          },
        ],
      });

      await assert.rejects(
        suspendPlatformUser({
          ...viewer,
          targetUserId: target.id,
          reason: "Viewer must remain read only",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "AUTHORIZATION_DENIED",
      );

      const suspendedUser = await suspendPlatformUser({
        ...operator,
        targetUserId: target.id,
        reason: "Investigating compromised credentials",
        now,
      });
      assert.equal(suspendedUser.revokedSessions, 2);
      assert.equal(await db.session.count({ where: { userId: target.id } }), 0);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: target.id } })).banned,
        true,
      );
      await restorePlatformUser({
        ...operator,
        targetUserId: target.id,
        reason: "Identity review completed",
        now,
      });
      await db.session.create({
        data: {
          id: `${prefix}-target-session-3`,
          token: `${prefix}-target-token-3`,
          userId: target.id,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        },
      });
      assert.equal(
        (
          await revokePlatformUserSessions({
            ...operator,
            targetUserId: target.id,
            reason: "Rotate all active sessions",
            now,
          })
        ).revokedSessions,
        1,
      );
      await assert.rejects(
        suspendPlatformUser({
          ...operator,
          targetUserId: operator.actorUserId,
          reason: "Unsafe self suspension",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "SELF_LOCKOUT",
      );

      const booth = await db.booth.create({
        data: {
          slug: `${prefix}-main`,
          name: "Phase 17C main booth",
          ownerId: owner.id,
          status: "PUBLISHED",
          memberships: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              { userId: recipient.id, role: "STAFF", status: "ACTIVE" },
            ],
          },
        },
        include: { memberships: true },
      });
      const otherOwner = await createOrdinaryUser(`${prefix}-other-owner`);
      const otherBooth = await db.booth.create({
        data: {
          slug: `${prefix}-other`,
          name: "Other booth",
          ownerId: otherOwner.id,
          memberships: {
            create: { userId: otherOwner.id, role: "OWNER", status: "ACTIVE" },
          },
        },
        include: { memberships: true },
      });

      await assert.rejects(
        suspendPlatformBooth({
          ...operator,
          boothId: booth.id,
          expectedVersion: 2,
          reason: "Reject stale service version",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "STALE_TARGET_VERSION",
      );

      const suspendedBooth = await suspendPlatformBooth({
        ...operator,
        boothId: booth.id,
        expectedVersion: 1,
        reason: "Manual abuse review",
        now,
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
      await assert.rejects(
        createTeamInvitation({
          boothId: booth.id,
          email: `${prefix}-invite@example.com`,
          role: "STAFF",
          actorUserId: owner.id,
          now,
        }),
        (error) =>
          error instanceof PlatformTargetError &&
          error.code === "BOOTH_READ_ONLY",
      );
      const restoredBooth = await restorePlatformBooth({
        ...operator,
        boothId: booth.id,
        expectedVersion: 2,
        reason: "Manual review cleared",
        now,
      });
      assert.equal(restoredBooth.serviceVersion, 3);
      await assert.rejects(
        restrictPlatformMembership({
          ...operator,
          boothId: booth.id,
          membershipId: otherBooth.memberships[0]!.id,
          role: "STAFF",
          status: "DISABLED",
          reason: "Cross-booth attempt",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "MEMBERSHIP_NOT_FOUND",
      );
      const recipientMembership = booth.memberships.find(
        (membership) => membership.userId === recipient.id,
      )!;
      const ownerMembership = booth.memberships.find(
        (membership) => membership.userId === owner.id,
      )!;
      await assert.rejects(
        restrictPlatformMembership({
          ...operator,
          boothId: booth.id,
          membershipId: ownerMembership.id,
          role: "ADMIN",
          status: "ACTIVE",
          reason: "Owner membership must stay protected",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "OWNER_PROTECTED",
      );
      await assert.rejects(
        restrictPlatformMembership({
          ...operator,
          boothId: booth.id,
          membershipId: recipientMembership.id,
          role: "OWNER" as "ADMIN",
          status: "ACTIVE",
          reason: "Forged owner elevation",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "INVALID_MEMBERSHIP_INPUT",
      );
      await restrictPlatformMembership({
        ...operator,
        boothId: booth.id,
        membershipId: recipientMembership.id,
        role: "ADMIN",
        status: "ACTIVE",
        reason: "Prepare approved ownership recipient",
        now,
      });
      await assert.rejects(
        previewPlatformOwnershipTransfer({
          ...operator,
          boothId: booth.id,
          recipientUserId: recipient.id,
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "AUTHORIZATION_DENIED",
      );
      const preview = await previewPlatformOwnershipTransfer({
        ...superAdmin,
        boothId: booth.id,
        recipientUserId: recipient.id,
        now,
      });
      assert.equal(preview.formerOwnerNextRole, "ADMIN");
      await assert.rejects(
        finalizePlatformOwnershipTransfer({
          ...superAdmin,
          boothId: booth.id,
          recipientUserId: recipient.id,
          expectedVersion: 2,
          confirmation: booth.slug,
          reason: "Reject stale ownership preview",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "STALE_TARGET_VERSION",
      );
      await assert.rejects(
        finalizePlatformOwnershipTransfer({
          ...superAdmin,
          boothId: booth.id,
          recipientUserId: recipient.id,
          expectedVersion: 3,
          confirmation: `${booth.slug}-wrong`,
          reason: "Reject incorrect typed confirmation",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "CONFIRMATION_MISMATCH",
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
          recipientUserId: recipient.id,
          expectedVersion: 3,
          confirmation: booth.slug,
          reason: "Reject expired destructive step up",
          now,
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
        recipientUserId: recipient.id,
        expectedVersion: 3,
        confirmation: booth.slug,
        reason: "Owner-requested account transition",
        now,
      });
      assert.equal(transfer.serviceVersion, 4);
      const transferred = await db.booth.findUniqueOrThrow({
        where: { id: booth.id },
        include: { memberships: true },
      });
      assert.equal(transferred.ownerId, recipient.id);
      assert.deepEqual(
        transferred.memberships
          .filter(
            (membership) =>
              membership.role === "OWNER" && membership.status === "ACTIVE",
          )
          .map(({ userId }) => userId),
        [recipient.id],
      );
      assert.equal(
        transferred.memberships.find(({ userId }) => userId === owner.id)?.role,
        "ADMIN",
      );
      await db.user.update({
        where: { id: `${prefix}-super2` },
        data: { banned: true, banReason: "Last-admin safety fixture" },
      });
      await assert.rejects(
        suspendPlatformUser({
          ...operator,
          targetUserId: superAdmin.actorUserId,
          reason: "Reject removal of last viable Super Admin",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "LAST_SUPER_ADMIN",
      );
      assert.ok(
        (await db.platformAuditLog.count({
          where: {
            actorUserId: { in: [operator.actorUserId, superAdmin.actorUserId] },
          },
        })) >= 8,
      );
    } finally {
      await cleanup(prefix);
    }
  },
);

test(
  "Phase 17C deletion is cooling-off protected, reversible, blocker-safe, and provider-retryable",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const prefix = `p17d-${suffix.slice(0, 12)}`;
    const now = new Date();
    const requestedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1_000);
    try {
      const operator = await createPlatformActor({
        id: `${prefix}-operator`,
        role: "PLATFORM_OPERATOR",
        now,
      });
      const superAdmin = await createPlatformActor({
        id: `${prefix}-super`,
        role: "PLATFORM_SUPER_ADMIN",
        now,
      });
      await createPlatformActor({
        id: `${prefix}-super2`,
        role: "PLATFORM_SUPER_ADMIN",
        now,
      });
      const owner = await createOrdinaryUser(`${prefix}-owner`);
      const booth = await db.booth.create({
        data: {
          slug: `${prefix}-blocked`,
          name: "Deletion blocker booth",
          ownerId: owner.id,
          memberships: {
            create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      });

      const firstRequest = await requestPlatformDeletion({
        ...operator,
        targetType: "BOOTH",
        targetId: booth.id,
        expectedVersion: 1,
        reason: "Owner requested booth deletion",
        now,
      });
      assert.equal(firstRequest.serviceVersion, 2);
      await assert.rejects(
        finalizePlatformBoothDeletion({
          ...superAdmin,
          boothId: booth.id,
          expectedVersion: 2,
          confirmation: booth.slug,
          reason: "Reject finalization during cooling off",
          now,
          deleteObjects: async () => ({
            deletedObjectKeys: [],
            failedObjectKeys: [],
            safeErrorCode: null,
          }),
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "COOLING_OFF_ACTIVE",
      );
      const cancellation = await cancelPlatformDeletion({
        ...operator,
        targetType: "BOOTH",
        targetId: booth.id,
        expectedVersion: 2,
        reason: "Owner withdrew request during cooling off",
        now,
      });
      assert.equal(cancellation.serviceVersion, 3);
      assert.equal(
        (await db.booth.findUniqueOrThrow({ where: { id: booth.id } }))
          .serviceState,
        "ACTIVE",
      );

      const oldRequest = await requestPlatformDeletion({
        ...operator,
        targetType: "BOOTH",
        targetId: booth.id,
        expectedVersion: 3,
        reason: "Owner confirmed booth deletion",
        now: requestedAt,
      });
      assert.equal(oldRequest.serviceVersion, 4);
      await assert.rejects(
        finalizePlatformBoothDeletion({
          ...operator,
          boothId: booth.id,
          expectedVersion: 4,
          confirmation: booth.slug,
          reason: "Operator cannot finalize deletion",
          now,
          deleteObjects: async () => ({
            deletedObjectKeys: [],
            failedObjectKeys: [],
            safeErrorCode: null,
          }),
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "AUTHORIZATION_DENIED",
      );
      await assert.rejects(
        finalizePlatformBoothDeletion({
          ...superAdmin,
          boothId: booth.id,
          expectedVersion: 4,
          confirmation: `${booth.slug}-wrong`,
          reason: "Reject incorrect booth confirmation",
          now,
          deleteObjects: async () => ({
            deletedObjectKeys: [],
            failedObjectKeys: [],
            safeErrorCode: null,
          }),
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "CONFIRMATION_MISMATCH",
      );
      const retainedOrder = await db.order.create({
        data: {
          boothId: booth.id,
          code: `${prefix}-order`,
          customerName: "Retained customer",
          customerEmail: `${prefix}-customer@example.com`,
          subtotalCents: BigInt(10_000),
          totalCents: BigInt(10_000),
          transferReference: `P17C-${suffix.slice(0, 12)}`,
          idempotencyKey: `${prefix}-idempotency`,
        },
      });
      const blocked = await finalizePlatformBoothDeletion({
        ...superAdmin,
        boothId: booth.id,
        expectedVersion: 4,
        confirmation: booth.slug,
        reason: "Finalize after cooling off",
        now,
        deleteObjects: async () => ({
          deletedObjectKeys: [],
          failedObjectKeys: [],
          safeErrorCode: null,
        }),
      });
      assert.equal(blocked.status, "BLOCKED");
      await db.order.delete({ where: { id: retainedOrder.id } });
      const completed = await finalizePlatformBoothDeletion({
        ...superAdmin,
        boothId: booth.id,
        expectedVersion: 4,
        confirmation: booth.slug,
        reason: "Retention blocker removed",
        now,
        deleteObjects: async () => ({
          deletedObjectKeys: [],
          failedObjectKeys: [],
          safeErrorCode: null,
        }),
      });
      assert.equal(completed.status, "COMPLETED");
      assert.equal(
        await db.booth.findUnique({ where: { id: booth.id } }),
        null,
      );

      const providerOwner = await createOrdinaryUser(
        `${prefix}-provider-owner`,
      );
      const providerBooth = await db.booth.create({
        data: {
          slug: `${prefix}-provider`,
          name: "Provider retry booth",
          ownerId: providerOwner.id,
          logoObjectKey: `booths/${prefix}/logo.webp`,
          memberships: {
            create: {
              userId: providerOwner.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
      });
      await requestPlatformDeletion({
        ...operator,
        targetType: "BOOTH",
        targetId: providerBooth.id,
        expectedVersion: 1,
        reason: "Provider cleanup acceptance",
        now: requestedAt,
      });
      const providerBlocked = await finalizePlatformBoothDeletion({
        ...superAdmin,
        boothId: providerBooth.id,
        expectedVersion: 2,
        confirmation: providerBooth.slug,
        reason: "First provider cleanup attempt",
        now,
        deleteObjects: async (keys) => ({
          deletedObjectKeys: [],
          failedObjectKeys: [...keys],
          safeErrorCode: "ORACLE_DELETE_FAILED",
        }),
      });
      assert.equal(providerBlocked.status, "PROVIDER_BLOCKED");
      assert.equal(
        (
          await db.platformDeletionRequest.findFirstOrThrow({
            where: { targetType: "BOOTH", targetId: providerBooth.id },
            orderBy: { requestedAt: "desc" },
          })
        ).state,
        "BLOCKED",
      );
      const providerCompleted = await finalizePlatformBoothDeletion({
        ...superAdmin,
        boothId: providerBooth.id,
        expectedVersion: 2,
        confirmation: providerBooth.slug,
        reason: "Retry provider cleanup",
        now,
        deleteObjects: async (keys) => ({
          deletedObjectKeys: [...keys],
          failedObjectKeys: [],
          safeErrorCode: null,
        }),
      });
      assert.equal(providerCompleted.status, "COMPLETED");

      const userTarget = await createOrdinaryUser(`${prefix}-user-target`);
      const referenceOwner = await createOrdinaryUser(
        `${prefix}-reference-owner`,
      );
      const referenceBooth = await db.booth.create({
        data: {
          slug: `${prefix}-reference`,
          name: "Retained reference booth",
          ownerId: referenceOwner.id,
          memberships: {
            create: {
              userId: referenceOwner.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
      });
      const retainedInvitation = await db.teamInvitation.create({
        data: {
          boothId: referenceBooth.id,
          email: `${prefix}-retained@example.com`,
          role: "STAFF",
          tokenHash: `${prefix}-retained-token`,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
          invitedById: userTarget.id,
        },
      });
      await db.session.create({
        data: {
          id: `${prefix}-user-session`,
          token: `${prefix}-user-token`,
          userId: userTarget.id,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        },
      });
      await requestPlatformDeletion({
        ...operator,
        targetType: "USER",
        targetId: userTarget.id,
        reason: "Account owner requested deletion",
        now: requestedAt,
      });
      assert.equal(
        await db.session.count({ where: { userId: userTarget.id } }),
        0,
      );
      await assert.rejects(
        finalizePlatformUserDeletion({
          ...superAdmin,
          targetUserId: userTarget.id,
          confirmation: `${userTarget.email}.wrong`,
          reason: "Reject incorrect account confirmation",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "CONFIRMATION_MISMATCH",
      );
      const userBlocked = await finalizePlatformUserDeletion({
        ...superAdmin,
        targetUserId: userTarget.id,
        confirmation: userTarget.email,
        reason: "Retained invitation must block deletion",
        now,
      });
      assert.equal(userBlocked.status, "BLOCKED");
      assert.equal(userBlocked.blockers.invitationReferences, 1);
      await db.teamInvitation.delete({ where: { id: retainedInvitation.id } });
      const userCompleted = await finalizePlatformUserDeletion({
        ...superAdmin,
        targetUserId: userTarget.id,
        confirmation: userTarget.email,
        reason: "Account cooling off completed",
        now,
      });
      assert.equal(userCompleted.status, "COMPLETED");
      assert.equal(
        await db.user.findUnique({ where: { id: userTarget.id } }),
        null,
      );
      assert.ok(
        (await db.platformAuditLog.count({
          where: { targetId: userTarget.id },
        })) > 0,
      );

      await assert.rejects(
        requestPlatformDeletion({
          ...superAdmin,
          targetType: "USER",
          targetId: superAdmin.actorUserId,
          reason: "Unsafe current actor request",
          now,
        }),
        (error) =>
          error instanceof PlatformLifecycleError &&
          error.code === "SELF_LOCKOUT",
      );
    } finally {
      await cleanup(prefix);
    }
  },
);
