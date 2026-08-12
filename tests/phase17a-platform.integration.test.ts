import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  assertPlatformRoleChangeAllowed,
  assertPlatformUserDestructiveActionAllowed,
  authorizePlatformSession,
  bootstrapInitialPlatformSuperAdmin,
  PlatformSafetyError,
  setPlatformRoleGrant,
} from "../lib/platform-access";
import {
  assertPlatformTargetAction,
  resolvePlatformTarget,
} from "../lib/platform-targets";

const enabled = process.env.CYFURDEN_PHASE17_INTEGRATION === "1";

test(
  "Phase 17A integrates migration, strong platform RBAC, target guards, and append-only audit",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ids = {
      bootstrap: `phase17-bootstrap-${suffix}`,
      viewer: `phase17-viewer-${suffix}`,
      operator: `phase17-operator-${suffix}`,
      boothOwner: `phase17-owner-${suffix}`,
      weak: `phase17-weak-${suffix}`,
      secondSuper: `phase17-super-${suffix}`,
    };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);

    const appliedMigration = await db.$queryRaw<
      Array<{ finished_at: Date | null; migration_name: string }>
    >`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      WHERE migration_name = '0014_phase17a_platform_foundation'
    `;
    assert.equal(appliedMigration.length, 1);
    assert.ok(appliedMigration[0]?.finished_at);

    const defaults = await db.platformQuotaDefault.findUniqueOrThrow({
      where: { id: "global" },
    });
    assert.deepEqual(
      {
        maxOwnedBooths: defaults.maxOwnedBooths,
        maxTeamSeats: defaults.maxTeamSeats,
        maxProducts: defaults.maxProducts,
        maxFaceboothProjects: defaults.maxFaceboothProjects,
        maxStorageBytes: defaults.maxStorageBytes.toString(),
      },
      {
        maxOwnedBooths: 5,
        maxTeamSeats: 10,
        maxProducts: 500,
        maxFaceboothProjects: 100,
        maxStorageBytes: "5368709120",
      },
    );

    await db.user.createMany({
      data: Object.values(ids).map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
      })),
    });

    const strongUsers = [
      ids.bootstrap,
      ids.viewer,
      ids.operator,
      ids.secondSuper,
    ];
    for (const userId of strongUsers) {
      await db.account.create({
        data: {
          id: `account-${userId}`,
          accountId: `${userId}@example.com`,
          providerId: "credential",
          userId,
          password: "test-password-hash",
        },
      });
      await db.twoFactor.create({
        data: {
          id: `two-factor-${userId}`,
          userId,
          secret: `encrypted-secret-${userId}`,
          backupCodes: "encrypted-backup-codes",
          verified: true,
        },
      });
      await db.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });
      await db.session.create({
        data: {
          id: `session-${userId}`,
          token: `token-${userId}`,
          userId,
          expiresAt,
          platformAuthenticatedAt: now,
        },
      });
    }

    assert.equal(
      await bootstrapInitialPlatformSuperAdmin({
        userId: ids.bootstrap,
        sessionId: `session-${ids.bootstrap}`,
        configuredUserId: ids.bootstrap,
      }),
      true,
    );
    assert.equal(
      await bootstrapInitialPlatformSuperAdmin({
        userId: ids.secondSuper,
        sessionId: `session-${ids.secondSuper}`,
        configuredUserId: ids.secondSuper,
      }),
      false,
    );

    const bootstrapAccess = await authorizePlatformSession({
      userId: ids.bootstrap,
      sessionId: `session-${ids.bootstrap}`,
      permission: "platform_role.manage",
      now,
    });
    assert.equal(bootstrapAccess.allowed, true);

    await assert.rejects(
      assertPlatformRoleChangeAllowed(db, {
        actorUserId: ids.bootstrap,
        targetUserId: ids.bootstrap,
        nextRole: "PLATFORM_OPERATOR",
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "LAST_SUPER_ADMIN",
    );
    await assert.rejects(
      assertPlatformRoleChangeAllowed(db, {
        actorUserId: ids.bootstrap,
        targetUserId: ids.bootstrap,
        nextRole: null,
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "SELF_FINAL_GRANT",
    );
    await assert.rejects(
      assertPlatformUserDestructiveActionAllowed(db, {
        actorUserId: ids.bootstrap,
        targetUserId: ids.bootstrap,
        action: "FINALIZE_DELETION",
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "SELF_DELETION_FINALIZATION",
    );

    for (const [targetUserId, role, reason] of [
      [ids.viewer, "PLATFORM_VIEWER", "Integration viewer"],
      [ids.operator, "PLATFORM_OPERATOR", "Integration operator"],
      [
        ids.secondSuper,
        "PLATFORM_SUPER_ADMIN",
        "Integration second Super Admin",
      ],
    ] as const) {
      assert.deepEqual(
        await setPlatformRoleGrant({
          actorUserId: ids.bootstrap,
          actorSessionId: `session-${ids.bootstrap}`,
          targetUserId,
          role,
          reason,
          now,
        }),
        { changed: true, role },
      );
    }

    assert.equal(
      (
        await authorizePlatformSession({
          userId: ids.viewer,
          sessionId: `session-${ids.viewer}`,
          permission: "platform.read",
          now,
        })
      ).allowed,
      true,
    );
    assert.deepEqual(
      await authorizePlatformSession({
        userId: ids.viewer,
        sessionId: `session-${ids.viewer}`,
        permission: "user.suspend",
        now,
      }),
      { allowed: false, reason: "PERMISSION_DENIED" },
    );
    assert.equal(
      (
        await authorizePlatformSession({
          userId: ids.operator,
          sessionId: `session-${ids.operator}`,
          permission: "user.suspend",
          now,
        })
      ).allowed,
      true,
    );

    await assert.rejects(
      setPlatformRoleGrant({
        actorUserId: ids.bootstrap,
        actorSessionId: `session-${ids.bootstrap}`,
        targetUserId: ids.weak,
        role: "PLATFORM_VIEWER",
        reason: "Reject weak authentication",
        now,
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "TARGET_STRONG_AUTH_REQUIRED",
    );
    await db.platformRoleGrant.create({
      data: {
        userId: ids.weak,
        role: "PLATFORM_VIEWER",
        grantedByUserId: ids.bootstrap,
        grantReason: "Deliberately corrupted integration grant",
      },
    });
    await db.user.update({
      where: { id: ids.weak },
      data: { role: "PLATFORM_VIEWER", twoFactorEnabled: true },
    });
    await db.session.create({
      data: {
        id: `session-${ids.weak}`,
        token: `token-${ids.weak}`,
        userId: ids.weak,
        expiresAt,
        platformAuthenticatedAt: now,
      },
    });
    assert.deepEqual(
      await authorizePlatformSession({
        userId: ids.weak,
        sessionId: `session-${ids.weak}`,
        permission: "platform.read",
        now,
      }),
      { allowed: false, reason: "CREDENTIAL_REQUIRED" },
    );

    await db.session.create({
      data: {
        id: `oauth-session-${ids.viewer}`,
        token: `oauth-token-${ids.viewer}`,
        userId: ids.viewer,
        expiresAt,
        platformAuthenticatedAt: null,
      },
    });
    assert.deepEqual(
      await authorizePlatformSession({
        userId: ids.viewer,
        sessionId: `oauth-session-${ids.viewer}`,
        permission: "platform.read",
        now,
      }),
      { allowed: false, reason: "PLATFORM_AUTH_REQUIRED" },
    );

    await assert.rejects(
      setPlatformRoleGrant({
        actorUserId: ids.viewer,
        actorSessionId: `session-${ids.viewer}`,
        targetUserId: ids.operator,
        role: "PLATFORM_VIEWER",
        reason: "Viewer cannot manage roles",
        now,
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "ROLE_CHANGE_NOT_ALLOWED",
    );

    const booth = await db.booth.create({
      data: {
        name: "Phase 17 target booth",
        slug: `phase17-${suffix.slice(0, 18)}`,
        ownerId: ids.boothOwner,
      },
    });
    await db.boothMembership.create({
      data: {
        boothId: booth.id,
        userId: ids.boothOwner,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    assert.deepEqual(
      await authorizePlatformSession({
        userId: ids.boothOwner,
        sessionId: "missing-session",
        permission: "platform.read",
        now,
      }),
      { allowed: false, reason: "PLATFORM_GRANT_REQUIRED" },
    );
    assert.equal(
      await resolvePlatformTarget({ type: "BOOTH", id: ids.boothOwner }),
      null,
    );
    assert.equal(
      await resolvePlatformTarget({ type: "USER", id: booth.id }),
      null,
    );
    const boothTarget = await resolvePlatformTarget({
      type: "BOOTH",
      id: booth.id,
    });
    assert.ok(boothTarget);
    assert.throws(() =>
      assertPlatformTargetAction({
        target: boothTarget,
        action: "REVOKE_SESSIONS",
      }),
    );

    const audit = await db.platformAuditLog.findFirstOrThrow({
      where: {
        actorUserId: ids.bootstrap,
        action: "platform.role.bootstrap",
      },
    });
    await assert.rejects(
      db.platformAuditLog.update({
        where: { id: audit.id },
        data: { reason: "Forbidden rewrite" },
      }),
    );
    await assert.rejects(
      db.platformAuditLog.delete({ where: { id: audit.id } }),
    );

    await assert.rejects(
      db.platformDeletionRequest.create({
        data: {
          targetType: "BOOTH",
          targetId: booth.id,
          requestedByUserId: ids.operator,
          reason: "Invalid short cooling off",
          coolingOffEndsAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
        },
      }),
    );
    await assert.rejects(
      db.storageAsset.create({
        data: {
          boothId: booth.id,
          objectKey: `booths/another-booth/product/image.png`,
          purpose: "PRODUCT_IMAGE",
          byteLength: BigInt(128),
          reservationExpiresAt: expiresAt,
        },
      }),
    );

    await assertPlatformRoleChangeAllowed(db, {
      actorUserId: ids.bootstrap,
      targetUserId: ids.bootstrap,
      nextRole: "PLATFORM_OPERATOR",
    });

    await db.user.update({
      where: { id: ids.secondSuper },
      data: { banned: true, banReason: "Integration suspension" },
    });
    await assert.rejects(
      assertPlatformRoleChangeAllowed(db, {
        actorUserId: ids.bootstrap,
        targetUserId: ids.bootstrap,
        nextRole: "PLATFORM_OPERATOR",
      }),
      (error) =>
        error instanceof PlatformSafetyError &&
        error.code === "LAST_SUPER_ADMIN",
    );
  },
);
