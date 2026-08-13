import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import { authorizePlatformSession } from "../lib/platform-access";
import { recordPlatformAudit } from "../lib/platform-audit";
import { collectPlatformCurrentHealth } from "../lib/platform-health-contract";
import { readPlatformAudit } from "../lib/platform-inventory";

const enabled = process.env.CYFURDEN_PHASE17E_INTEGRATION === "1";

test(
  "Phase 17E proves private PostgreSQL health and hardened audit filtering",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const actorUserId = `phase17e-viewer-${suffix}`;
    const ordinaryUserId = `phase17e-ordinary-${suffix}`;
    const sessionId = `phase17e-session-${suffix}`;
    const action = `phase17e.audit.${suffix}`;
    const now = new Date();
    const previousRelease = process.env.CYFURDEN_RELEASE_ID;
    const oracleVariables = [
      "ORACLE_OBJECT_STORAGE_NAMESPACE",
      "ORACLE_OBJECT_STORAGE_REGION",
      "ORACLE_OBJECT_STORAGE_BUCKET",
      "ORACLE_OBJECT_STORAGE_ACCESS_KEY_ID",
      "ORACLE_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    ] as const;
    const previousOracle = Object.fromEntries(
      oracleVariables.map((key) => [key, process.env[key]]),
    );

    try {
      await db.user.createMany({
        data: [
          {
            id: actorUserId,
            name: "Phase 17E Viewer",
            email: `${actorUserId}@example.com`,
            emailVerified: true,
            role: "PLATFORM_VIEWER",
            twoFactorEnabled: true,
          },
          {
            id: ordinaryUserId,
            name: "Phase 17E Ordinary User",
            email: `${ordinaryUserId}@example.com`,
            emailVerified: true,
          },
        ],
      });
      await db.account.create({
        data: {
          id: `phase17e-account-${suffix}`,
          accountId: `${actorUserId}@example.com`,
          providerId: "credential",
          userId: actorUserId,
          password: "phase17e-password-hash",
        },
      });
      await db.twoFactor.create({
        data: {
          id: `phase17e-totp-${suffix}`,
          userId: actorUserId,
          secret: `phase17e-totp-secret-${suffix}`,
          backupCodes: "phase17e-backup-codes",
          verified: true,
        },
      });
      await db.session.create({
        data: {
          id: sessionId,
          token: `phase17e-token-${suffix}`,
          userId: actorUserId,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
          platformAuthenticatedAt: now,
        },
      });
      await db.platformRoleGrant.create({
        data: {
          userId: actorUserId,
          role: "PLATFORM_VIEWER",
          grantedByUserId: actorUserId,
          grantReason: "Phase 17E health and audit acceptance",
        },
      });

      const platformAccess = await authorizePlatformSession({
        userId: actorUserId,
        sessionId,
        permission: "platform.read",
        now,
      });
      assert.equal(platformAccess.allowed, true);
      process.env.CYFURDEN_RELEASE_ID = "phase17e-integration";
      for (const key of oracleVariables) delete process.env[key];
      const health = await collectPlatformCurrentHealth({
        releaseId: process.env.CYFURDEN_RELEASE_ID,
        probes: {
          database: async () => {
            await db.$queryRaw`SELECT 1`;
          },
        },
      });
      assert.equal(health.application.state, "HEALTHY");
      assert.equal(health.postgresql.state, "HEALTHY");
      assert.equal(health.oracle.state, "UNKNOWN");
      assert.equal(health.oracle.errorCode, "ORACLE_NOT_CONFIGURED");

      const ordinaryAccess = await authorizePlatformSession({
        userId: ordinaryUserId,
        sessionId: "missing-session",
        permission: "platform.read",
        now,
      });
      assert.equal(ordinaryAccess.allowed, false);

      await recordPlatformAudit({
        actorUserId,
        action,
        targetType: "PLATFORM",
        targetId: "phase17e-health",
        reason: "database URL: postgresql://private; health review",
        beforeMetadata: {
          state: "UNKNOWN",
          objectKey: "booths/private/object.webp",
        },
        afterMetadata: { state: "HEALTHY" },
      });
      const storedAudit = await db.platformAuditLog.findFirstOrThrow({
        where: { actorUserId, action },
      });
      assert.doesNotMatch(storedAudit.reason, /postgresql:\/\//);

      const auditAccess = await authorizePlatformSession({
        userId: actorUserId,
        sessionId,
        permission: "audit.read",
        now,
      });
      assert.equal(auditAccess.allowed, true);
      const date = now.toISOString().slice(0, 10);
      const audit = await readPlatformAudit(auditAccess, {
        actor: actorUserId,
        targetType: "PLATFORM",
        targetId: "phase17e-health",
        action,
        from: date,
        to: date,
      });
      assert.equal(audit.pagination.total, 1);
      assert.doesNotMatch(
        JSON.stringify(audit.audit[0]),
        /postgresql:\/\/private|booths\/private\/object\.webp/,
      );
      const invalidDate = await readPlatformAudit(auditAccess, {
        action,
        from: "2026-02-31",
      });
      assert.equal(invalidDate.filters.from, "");
    } finally {
      if (previousRelease === undefined) {
        delete process.env.CYFURDEN_RELEASE_ID;
      } else {
        process.env.CYFURDEN_RELEASE_ID = previousRelease;
      }
      for (const key of oracleVariables) {
        const value = previousOracle[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await db.user.deleteMany({
        where: { id: { in: [actorUserId, ordinaryUserId] } },
      });
    }
  },
);
