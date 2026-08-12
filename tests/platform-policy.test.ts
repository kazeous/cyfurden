import assert from "node:assert/strict";
import test from "node:test";
import { redactPlatformAuditMetadata } from "../lib/platform-audit";
import {
  readConfiguredPlatformBootstrapUserId,
  requireRecentPlatformStepUp,
} from "../lib/platform-access";
import {
  platformPermissionMatrix,
  platformPolicy,
  platformRoleHasPermission,
} from "../lib/platform-policy";
import {
  assertBoothServiceAccess,
  assertPlatformTargetAction,
  PlatformTargetError,
} from "../lib/platform-targets";

test("Phase 17A freezes the approved platform role matrix", () => {
  assert.deepEqual(platformPermissionMatrix.PLATFORM_VIEWER, [
    "platform.read",
    "audit.read",
  ]);
  assert.equal(
    platformRoleHasPermission("PLATFORM_OPERATOR", "deletion.request"),
    true,
  );
  assert.equal(
    platformRoleHasPermission("PLATFORM_OPERATOR", "deletion.finalize"),
    false,
  );
  assert.equal(
    platformRoleHasPermission("PLATFORM_SUPER_ADMIN", "ownership.transfer"),
    true,
  );
  assert.equal(
    platformRoleHasPermission("PLATFORM_SUPER_ADMIN", "platform_role.manage"),
    true,
  );
});

test("Phase 17A freezes approved strong-auth, quota, deletion, and health wording", () => {
  assert.equal(platformPolicy.auth.requiresCredentialAccount, true);
  assert.equal(platformPolicy.auth.requiresVerifiedTotp, true);
  assert.equal(platformPolicy.auth.allowImpersonation, false);
  assert.equal(platformPolicy.auth.destructiveStepUpMaxAgeMs, 15 * 60 * 1_000);
  assert.equal(platformPolicy.deletion.coolingOffDays, 7);
  assert.deepEqual(
    {
      maxOwnedBooths: platformPolicy.quotaDefaults.maxOwnedBooths,
      maxTeamSeats: platformPolicy.quotaDefaults.maxTeamSeats,
      maxProducts: platformPolicy.quotaDefaults.maxProducts,
      maxFaceboothProjects: platformPolicy.quotaDefaults.maxFaceboothProjects,
      maxStorageBytes: platformPolicy.quotaDefaults.maxStorageBytes.toString(),
    },
    {
      maxOwnedBooths: 5,
      maxTeamSeats: 10,
      maxProducts: 500,
      maxFaceboothProjects: 100,
      maxStorageBytes: "5368709120",
    },
  );
  assert.equal(platformPolicy.availability.en, "Current health");
  assert.equal(platformPolicy.availability.historicalUptimeEnabled, false);
});

test("platform bootstrap accepts only an exact bounded stable user ID", () => {
  assert.equal(
    readConfiguredPlatformBootstrapUserId("stable-user-id"),
    "stable-user-id",
  );
  assert.equal(readConfiguredPlatformBootstrapUserId(""), null);
  assert.throws(() => readConfiguredPlatformBootstrapUserId(" user-id"));
  assert.throws(() => readConfiguredPlatformBootstrapUserId("user-id\n"));
});

test("destructive platform step-up expires after fifteen minutes", () => {
  const verifiedAt = new Date("2026-08-13T00:00:00.000Z");
  const access = {
    allowed: true as const,
    permission: "deletion.finalize" as const,
    role: "PLATFORM_SUPER_ADMIN" as const,
    userId: "user-1",
    sessionId: "session-1",
    platformAuthenticatedAt: verifiedAt,
  };
  assert.equal(
    requireRecentPlatformStepUp(
      access,
      new Date(verifiedAt.getTime() + 15 * 60 * 1_000),
    ),
    access,
  );
  assert.throws(() =>
    requireRecentPlatformStepUp(
      access,
      new Date(verifiedAt.getTime() + 15 * 60 * 1_000 + 1),
    ),
  );
});

test("target-state enforcement keeps user and booth actions separated", () => {
  assert.throws(
    () =>
      assertPlatformTargetAction({
        target: {
          type: "BOOTH",
          id: "booth-1",
          state: "ACTIVE",
          version: 1,
        },
        action: "REVOKE_SESSIONS",
      }),
    (error) =>
      error instanceof PlatformTargetError &&
      error.code === "TARGET_TYPE_MISMATCH",
  );
  assert.throws(
    () =>
      assertPlatformTargetAction({
        target: {
          type: "BOOTH",
          id: "booth-1",
          state: "SUSPENDED",
          version: 2,
        },
        action: "MANAGE_MEMBERSHIP",
        expectedVersion: 2,
      }),
    (error) =>
      error instanceof PlatformTargetError &&
      error.code === "TARGET_STATE_CONFLICT",
  );
  assert.doesNotThrow(() =>
    assertBoothServiceAccess("SUSPENDED", "MEMBER_READ"),
  );
  assert.throws(
    () => assertBoothServiceAccess("SUSPENDED", "MUTATION"),
    (error) =>
      error instanceof PlatformTargetError && error.code === "BOOTH_READ_ONLY",
  );
});

test("platform audit metadata is bounded and redacts sensitive values", () => {
  const redacted = redactPlatformAuditMetadata({
    accountId: "safe-operational-id",
    password: "do-not-store",
    nested: {
      transferReference: "do-not-store",
      count: 2,
    },
  }) as Record<string, unknown>;
  assert.equal(redacted.accountId, "safe-operational-id");
  assert.equal(redacted.password, "[REDACTED]");
  assert.deepEqual(redacted.nested, {
    transferReference: "[REDACTED]",
    count: 2,
  });
  assert.throws(() =>
    redactPlatformAuditMetadata(
      Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [
          `field-${index}`,
          "x".repeat(500),
        ]),
      ),
    ),
  );
});
