import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import { authorizePlatformSession } from "../lib/platform-access";
import {
  readPlatformAudit,
  readPlatformBoothDetail,
  readPlatformBooths,
  readPlatformOverview,
  readPlatformUserDetail,
  readPlatformUsers,
} from "../lib/platform-inventory";

const enabled = process.env.CYFURDEN_PHASE17_INTEGRATION === "1";

test(
  "Phase 17B matches direct inventory queries and denies non-platform reads",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const now = new Date();
    const viewerId = `phase17b-viewer-${suffix}`;
    const ownerId = `phase17b-owner-${suffix}`;
    const normalId = `phase17b-normal-${suffix}`;
    const viewerSessionId = `phase17b-session-${suffix}`;

    await db.user.createMany({
      data: [
        {
          id: viewerId,
          name: "Phase 17B Viewer",
          email: `${viewerId}@example.com`,
          emailVerified: true,
          role: "PLATFORM_VIEWER",
          twoFactorEnabled: true,
        },
        {
          id: ownerId,
          name: "Phase 17B Booth Owner",
          email: `${ownerId}@example.com`,
          emailVerified: true,
        },
        {
          id: normalId,
          name: "Phase 17B Ordinary User",
          email: `${normalId}@example.com`,
          emailVerified: true,
        },
      ],
    });
    await db.account.create({
      data: {
        id: `phase17b-account-${suffix}`,
        accountId: `${viewerId}@example.com`,
        providerId: "credential",
        userId: viewerId,
        password: "integration-password-hash",
      },
    });
    await db.twoFactor.create({
      data: {
        id: `phase17b-totp-${suffix}`,
        userId: viewerId,
        secret: `phase17b-secret-${suffix}`,
        backupCodes: "phase17b-encrypted-backup-codes",
        verified: true,
      },
    });
    await db.session.create({
      data: {
        id: viewerSessionId,
        token: `phase17b-token-${suffix}`,
        userId: viewerId,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        platformAuthenticatedAt: now,
      },
    });
    await db.platformRoleGrant.create({
      data: {
        userId: viewerId,
        role: "PLATFORM_VIEWER",
        grantedByUserId: viewerId,
        grantReason: "Phase 17B integration viewer",
      },
    });

    const booth = await db.booth.create({
      data: {
        name: `Phase 17B Booth ${suffix}`,
        slug: `phase17b-${suffix.slice(0, 18)}`,
        ownerId,
        status: "PUBLISHED",
      },
    });
    await db.boothMembership.create({
      data: {
        boothId: booth.id,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    await db.boothQuotaOverride.create({
      data: {
        boothId: booth.id,
        maxStorageBytes: BigInt(8_192),
        updatedByUserId: viewerId,
        reason: "Phase 17B integration quota",
      },
    });
    await db.storageAsset.createMany({
      data: [
        {
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/verified.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: BigInt(1_024),
          verifiedMime: "image/webp",
          verifiedAt: now,
          state: "VERIFIED",
        },
        {
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/reserved.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: BigInt(2_048),
          reservationExpiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
          state: "RESERVED",
        },
        {
          boothId: booth.id,
          objectKey: `booths/${booth.id}/products/orphan.webp`,
          purpose: "PRODUCT_IMAGE",
          byteLength: BigInt(512),
          state: "ORPHANED",
        },
      ],
    });
    const auditAction = `phase17b.redaction.${suffix}`;
    await db.platformAuditLog.create({
      data: {
        actorUserId: viewerId,
        action: auditAction,
        targetType: "BOOTH",
        targetId: booth.id,
        reason: "bank account: 123456789; inventory check",
        beforeMetadata: {
          state: "DRAFT",
          bankAccountNumber: "123456789",
          opaquePayload: "must-not-render",
        },
        afterMetadata: { state: "PUBLISHED" },
        correlationId: `phase17b-correlation-${suffix}`,
      },
    });

    const access = await authorizePlatformSession({
      userId: viewerId,
      sessionId: viewerSessionId,
      permission: "platform.read",
      now,
    });
    assert.equal(access.allowed, true);
    const overview = await readPlatformOverview(access, now);

    const [users, openUserDeletions, booths, assets, defaults, overrides] =
      await Promise.all([
        db.user.findMany({
          select: { id: true, banned: true, banExpires: true },
        }),
        db.platformDeletionRequest.findMany({
          where: {
            targetType: "USER",
            state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
          },
          select: { targetId: true },
        }),
        db.booth.findMany({ select: { serviceState: true, status: true } }),
        db.storageAsset.findMany({
          select: {
            state: true,
            byteLength: true,
            reservationExpiresAt: true,
          },
        }),
        db.platformQuotaDefault.findUniqueOrThrow({ where: { id: "global" } }),
        db.boothQuotaOverride.findMany({ select: { maxStorageBytes: true } }),
      ]);
    const pendingUserIds = new Set(
      openUserDeletions.map(({ targetId }) => targetId),
    );
    const expectedAccounts = {
      total: users.length,
      active: users.filter(
        (user) =>
          !pendingUserIds.has(user.id) &&
          !(
            user.banned === true &&
            (!user.banExpires || user.banExpires.getTime() > now.getTime())
          ),
      ).length,
      suspended: users.filter(
        (user) =>
          !pendingUserIds.has(user.id) &&
          user.banned === true &&
          (!user.banExpires || user.banExpires.getTime() > now.getTime()),
      ).length,
      pendingDeletion: users.filter((user) => pendingUserIds.has(user.id))
        .length,
    };
    assert.deepEqual(overview.accounts, expectedAccounts);
    assert.deepEqual(
      overview.booths,
      booths.reduce(
        (counts, current) => {
          counts.total += 1;
          if (current.serviceState === "ACTIVE") counts.active += 1;
          if (current.serviceState === "SUSPENDED") counts.suspended += 1;
          if (current.serviceState === "DELETION_PENDING") {
            counts.pendingDeletion += 1;
          }
          if (current.status === "DRAFT") counts.draft += 1;
          if (current.status === "PUBLISHED") counts.published += 1;
          if (current.status === "ARCHIVED") counts.archived += 1;
          return counts;
        },
        {
          total: 0,
          active: 0,
          suspended: 0,
          pendingDeletion: 0,
          draft: 0,
          published: 0,
          archived: 0,
        },
      ),
    );
    const expectedStorage = assets.reduce(
      (counts, asset) => {
        if (
          ["VERIFIED", "DETACHED", "DELETION_PENDING"].includes(asset.state)
        ) {
          counts.trackedBytes += asset.byteLength;
          counts.trackedObjects += 1;
        } else if (
          asset.state === "RESERVED" &&
          asset.reservationExpiresAt &&
          asset.reservationExpiresAt.getTime() > now.getTime()
        ) {
          counts.reservedBytes += asset.byteLength;
          counts.reservedObjects += 1;
        } else if (["MISSING", "ORPHANED"].includes(asset.state)) {
          counts.driftBytes += asset.byteLength;
          counts.driftObjects += 1;
        }
        return counts;
      },
      {
        trackedBytes: BigInt(0),
        trackedObjects: 0,
        reservedBytes: BigInt(0),
        reservedObjects: 0,
        driftBytes: BigInt(0),
        driftObjects: 0,
      },
    );
    assert.equal(
      overview.storage.trackedBytes,
      expectedStorage.trackedBytes.toString(),
    );
    assert.equal(
      overview.storage.trackedObjects,
      expectedStorage.trackedObjects,
    );
    assert.equal(
      overview.storage.reservedBytes,
      expectedStorage.reservedBytes.toString(),
    );
    assert.equal(
      overview.storage.reservedObjects,
      expectedStorage.reservedObjects,
    );
    assert.equal(
      overview.storage.driftBytes,
      expectedStorage.driftBytes.toString(),
    );
    assert.equal(overview.storage.driftObjects, expectedStorage.driftObjects);
    const expectedQuota =
      defaults.maxStorageBytes * BigInt(booths.length) +
      overrides.reduce(
        (delta, override) =>
          delta +
          (override.maxStorageBytes === null
            ? BigInt(0)
            : override.maxStorageBytes - defaults.maxStorageBytes),
        BigInt(0),
      );
    assert.equal(
      overview.storage.configuredQuotaBytes,
      expectedQuota.toString(),
    );

    const listUsers = Array.from({ length: 23 }, (_, index) => ({
      id: `phase17b-list-${suffix}-${String(index).padStart(2, "0")}`,
      name: `Phase 17B list ${suffix} ${index}`,
      email: `phase17b-list-${suffix}-${index}@example.com`,
      emailVerified: true,
    }));
    await db.user.createMany({ data: listUsers });
    const firstPage = await readPlatformUsers(access, {
      search: `phase17b-list-${suffix}`,
      page: "1",
    });
    const secondPage = await readPlatformUsers(access, {
      search: `phase17b-list-${suffix}`,
      page: "2",
    });
    assert.equal(firstPage.pagination.total, 23);
    assert.equal(firstPage.users.length, 20);
    assert.equal(secondPage.users.length, 3);

    const userDetail = await readPlatformUserDetail(access, ownerId, now);
    assert.ok(userDetail);
    assert.equal(userDetail.ownedBooths.length, 1);
    const userPayload = JSON.stringify(userDetail);
    for (const forbidden of [
      "password",
      "sessionToken",
      "ipAddress",
      "userAgent",
      "customerAddress",
      "bankAccountNumber",
      "transferReference",
    ]) {
      assert.doesNotMatch(userPayload, new RegExp(forbidden, "i"));
    }

    const boothList = await readPlatformBooths(
      access,
      { search: booth.id },
      now,
    );
    assert.equal(boothList.pagination.total, 1);
    assert.equal(boothList.booths[0]?.trackedStorageBytes, "1024");
    assert.equal(boothList.booths[0]?.reservedStorageBytes, "2048");
    assert.equal(boothList.booths[0]?.driftStorageBytes, "512");
    const boothDetail = await readPlatformBoothDetail(access, booth.id, now);
    assert.ok(boothDetail);
    assert.equal(boothDetail.deletionBlockers.retainedOrderReferences, 0);
    assert.doesNotMatch(
      JSON.stringify(boothDetail),
      /(123456789|must-not-render)/i,
    );

    const auditAccess = await authorizePlatformSession({
      userId: viewerId,
      sessionId: viewerSessionId,
      permission: "audit.read",
      now,
    });
    assert.equal(auditAccess.allowed, true);
    const audit = await readPlatformAudit(auditAccess, { action: auditAction });
    assert.equal(audit.pagination.total, 1);
    const auditPayload = JSON.stringify(audit.audit[0]);
    assert.doesNotMatch(auditPayload, /123456789|must-not-render/);
    assert.match(auditPayload, /\[REDACTED\]/);
    await assert.rejects(readPlatformAudit(access, { action: auditAction }), {
      message: "Platform inventory access denied.",
    });

    const denied = await authorizePlatformSession({
      userId: normalId,
      sessionId: "missing-session",
      permission: "platform.read",
      now,
    });
    assert.equal(denied.allowed, false);
    await assert.rejects(readPlatformOverview(denied, now), {
      message: "Platform inventory access denied.",
    });
  },
);
