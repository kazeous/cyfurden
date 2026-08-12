import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordPlatformAudit } from "@/lib/platform-audit";
import {
  platformPolicy,
  platformRoleHasPermission,
  type PlatformPermission,
  type PlatformRoleName,
} from "@/lib/platform-policy";

const bootstrapReason = "Initial platform Super Admin bootstrap";

export type PlatformAccessDenial =
  | "UNAUTHENTICATED"
  | "ACCOUNT_UNAVAILABLE"
  | "PLATFORM_GRANT_REQUIRED"
  | "PLATFORM_GRANT_INCONSISTENT"
  | "CREDENTIAL_REQUIRED"
  | "TOTP_REQUIRED"
  | "PLATFORM_AUTH_REQUIRED"
  | "PERMISSION_DENIED";

export type PlatformAccessResult =
  | {
      allowed: true;
      permission: PlatformPermission;
      role: PlatformRoleName;
      userId: string;
      sessionId: string;
      platformAuthenticatedAt: Date;
    }
  | {
      allowed: false;
      reason: PlatformAccessDenial;
    };

export class PlatformSafetyError extends Error {
  constructor(
    public readonly code:
      | "LAST_SUPER_ADMIN"
      | "SELF_FINAL_GRANT"
      | "SELF_DELETION_FINALIZATION"
      | "TARGET_STRONG_AUTH_REQUIRED"
      | "ROLE_CHANGE_NOT_ALLOWED",
  ) {
    super(code);
    this.name = "PlatformSafetyError";
  }
}

export function readConfiguredPlatformBootstrapUserId(
  value = process.env.PLATFORM_SUPER_ADMIN_USER_ID,
) {
  if (value === undefined || value === "") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 240 ||
    normalized !== value ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(
      "PLATFORM_SUPER_ADMIN_USER_ID must be one stable user ID without surrounding whitespace.",
    );
  }
  return normalized;
}

async function readStrongPlatformIdentity(userId: string, sessionId: string) {
  const [user, pendingDeletion] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        banned: true,
        banExpires: true,
        twoFactorEnabled: true,
        accounts: {
          where: { providerId: "credential", password: { not: null } },
          select: { id: true },
          take: 1,
        },
        twoFactors: {
          where: { verified: true },
          select: { id: true },
          take: 1,
        },
        platformRoleGrant: {
          select: { role: true, status: true },
        },
        sessions: {
          where: { id: sessionId },
          select: {
            id: true,
            expiresAt: true,
            platformAuthenticatedAt: true,
          },
          take: 1,
        },
      },
    }),
    db.platformDeletionRequest.findFirst({
      where: {
        targetType: "USER",
        targetId: userId,
        state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
      },
      select: { id: true },
    }),
  ]);
  return { pendingDeletion, user };
}

export async function authorizePlatformSession(input: {
  userId: string;
  sessionId: string;
  permission: PlatformPermission;
  now?: Date;
}): Promise<PlatformAccessResult> {
  const now = input.now ?? new Date();
  const { pendingDeletion, user } = await readStrongPlatformIdentity(
    input.userId,
    input.sessionId,
  );
  if (!user || pendingDeletion) {
    return { allowed: false, reason: "ACCOUNT_UNAVAILABLE" };
  }

  const currentlyBanned =
    user.banned === true &&
    (!user.banExpires || user.banExpires.getTime() > now.getTime());
  if (currentlyBanned) {
    return { allowed: false, reason: "ACCOUNT_UNAVAILABLE" };
  }
  if (!user.platformRoleGrant || user.platformRoleGrant.status !== "ACTIVE") {
    return { allowed: false, reason: "PLATFORM_GRANT_REQUIRED" };
  }
  if (user.role !== user.platformRoleGrant.role) {
    return { allowed: false, reason: "PLATFORM_GRANT_INCONSISTENT" };
  }
  if (!user.accounts.length) {
    return { allowed: false, reason: "CREDENTIAL_REQUIRED" };
  }
  if (user.twoFactorEnabled !== true || !user.twoFactors.length) {
    return { allowed: false, reason: "TOTP_REQUIRED" };
  }

  const activeSession = user.sessions[0];
  if (
    !activeSession ||
    activeSession.expiresAt.getTime() <= now.getTime() ||
    !activeSession.platformAuthenticatedAt
  ) {
    return { allowed: false, reason: "PLATFORM_AUTH_REQUIRED" };
  }

  const role = user.platformRoleGrant.role as PlatformRoleName;
  if (!platformRoleHasPermission(role, input.permission)) {
    return { allowed: false, reason: "PERMISSION_DENIED" };
  }

  return {
    allowed: true,
    permission: input.permission,
    role,
    userId: user.id,
    sessionId: activeSession.id,
    platformAuthenticatedAt: activeSession.platformAuthenticatedAt,
  };
}

export function requireRecentPlatformStepUp(
  access: Extract<PlatformAccessResult, { allowed: true }>,
  now = new Date(),
) {
  const age = now.getTime() - access.platformAuthenticatedAt.getTime();
  if (age < 0 || age > platformPolicy.auth.destructiveStepUpMaxAgeMs) {
    throw new Error("A recent platform TOTP verification is required.");
  }
  return access;
}

export async function bootstrapInitialPlatformSuperAdmin(input: {
  userId: string;
  sessionId: string;
  configuredUserId?: string | null;
}) {
  const configuredUserId =
    input.configuredUserId === undefined
      ? readConfiguredPlatformBootstrapUserId()
      : input.configuredUserId;
  if (!configuredUserId || configuredUserId !== input.userId) return false;

  const identity = await readStrongPlatformIdentity(
    input.userId,
    input.sessionId,
  );
  const session = identity.user?.sessions[0];
  const bootstrapCurrentlyBanned =
    identity.user?.banned === true &&
    (!identity.user.banExpires ||
      identity.user.banExpires.getTime() > Date.now());
  if (
    !identity.user ||
    identity.pendingDeletion ||
    bootstrapCurrentlyBanned ||
    !identity.user.accounts.length ||
    identity.user.twoFactorEnabled !== true ||
    !identity.user.twoFactors.length ||
    !session?.platformAuthenticatedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (transaction) => {
          if ((await transaction.platformRoleGrant.count()) > 0) return false;

          const target = await transaction.user.findUnique({
            where: { id: input.userId },
            select: {
              role: true,
              banned: true,
              banExpires: true,
              twoFactorEnabled: true,
            },
          });
          const credential = await transaction.account.findFirst({
            where: {
              userId: input.userId,
              providerId: "credential",
              password: { not: null },
            },
            select: { id: true },
          });
          const verifiedTotp = await transaction.twoFactor.findFirst({
            where: { userId: input.userId, verified: true },
            select: { id: true },
          });
          const targetSession = await transaction.session.findUnique({
            where: { id: input.sessionId },
            select: {
              userId: true,
              expiresAt: true,
              platformAuthenticatedAt: true,
            },
          });
          const targetDeletion =
            await transaction.platformDeletionRequest.findFirst({
              where: {
                targetType: "USER",
                targetId: input.userId,
                state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
              },
              select: { id: true },
            });
          const transactionNow = new Date();
          const targetCurrentlyBanned =
            target?.banned === true &&
            (!target.banExpires ||
              target.banExpires.getTime() > transactionNow.getTime());
          if (
            !target ||
            targetDeletion ||
            targetCurrentlyBanned ||
            !credential ||
            target.twoFactorEnabled !== true ||
            !verifiedTotp ||
            targetSession?.userId !== input.userId ||
            !targetSession?.platformAuthenticatedAt ||
            targetSession.expiresAt.getTime() <= transactionNow.getTime()
          ) {
            return false;
          }

          const grant = await transaction.platformRoleGrant.create({
            data: {
              userId: input.userId,
              role: "PLATFORM_SUPER_ADMIN",
              status: "ACTIVE",
              grantedByUserId: input.userId,
              grantReason: bootstrapReason,
            },
          });
          await transaction.user.update({
            where: { id: input.userId },
            data: { role: "PLATFORM_SUPER_ADMIN" },
          });
          await recordPlatformAudit(
            {
              actorUserId: input.userId,
              action: "platform.role.bootstrap",
              targetType: "PLATFORM_ROLE_GRANT",
              targetId: grant.id,
              reason: bootstrapReason,
              beforeMetadata: { role: target.role },
              afterMetadata: {
                role: "PLATFORM_SUPER_ADMIN",
                status: "ACTIVE",
                userId: input.userId,
              },
            },
            transaction,
          );
          return true;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        attempt < 2 &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  return false;
}

type GrantClient = Pick<
  Prisma.TransactionClient,
  | "account"
  | "platformRoleGrant"
  | "platformDeletionRequest"
  | "twoFactor"
  | "user"
>;

async function hasAnotherViableSuperAdmin(
  client: GrantClient,
  excludedUserId: string,
  now = new Date(),
) {
  const grants = await client.platformRoleGrant.findMany({
    where: {
      userId: { not: excludedUserId },
      role: "PLATFORM_SUPER_ADMIN",
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  if (!grants.length) return false;
  const candidateIds = grants.map(({ userId }) => userId);
  const users = await client.user.findMany({
    where: {
      id: { in: candidateIds },
      role: "PLATFORM_SUPER_ADMIN",
      twoFactorEnabled: true,
      OR: [{ banned: false }, { banned: null }, { banExpires: { lte: now } }],
    },
    select: { id: true },
  });
  if (!users.length) return false;
  const availableUserIds = users.map(({ id }) => id);
  const credentials = await client.account.findMany({
    where: {
      userId: { in: availableUserIds },
      providerId: "credential",
      password: { not: null },
    },
    select: { userId: true },
  });
  const verifiedTotps = await client.twoFactor.findMany({
    where: { userId: { in: availableUserIds }, verified: true },
    select: { userId: true },
  });
  const pendingIds = await client.platformDeletionRequest.findMany({
    where: {
      targetType: "USER",
      targetId: { in: availableUserIds },
      state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
    },
    select: { targetId: true },
  });
  const credentialUserIds = new Set(credentials.map(({ userId }) => userId));
  const totpUserIds = new Set(verifiedTotps.map(({ userId }) => userId));
  const blocked = new Set(pendingIds.map(({ targetId }) => targetId));
  return availableUserIds.some(
    (userId) =>
      credentialUserIds.has(userId) &&
      totpUserIds.has(userId) &&
      !blocked.has(userId),
  );
}

export async function assertPlatformRoleChangeAllowed(
  client: GrantClient,
  input: {
    actorUserId: string;
    targetUserId: string;
    nextRole: PlatformRoleName | null;
  },
) {
  const current = await client.platformRoleGrant.findUnique({
    where: { userId: input.targetUserId },
    select: { role: true, status: true },
  });
  if (!current || current.status !== "ACTIVE") return;

  if (input.actorUserId === input.targetUserId && input.nextRole === null) {
    throw new PlatformSafetyError("SELF_FINAL_GRANT");
  }
  if (
    current.role === "PLATFORM_SUPER_ADMIN" &&
    input.nextRole !== "PLATFORM_SUPER_ADMIN"
  ) {
    if (!(await hasAnotherViableSuperAdmin(client, input.targetUserId))) {
      throw new PlatformSafetyError("LAST_SUPER_ADMIN");
    }
  }
}

export async function assertPlatformUserDestructiveActionAllowed(
  client: GrantClient,
  input: {
    actorUserId: string;
    targetUserId: string;
    action: "SUSPEND" | "FINALIZE_DELETION";
  },
) {
  if (
    input.action === "FINALIZE_DELETION" &&
    input.actorUserId === input.targetUserId
  ) {
    throw new PlatformSafetyError("SELF_DELETION_FINALIZATION");
  }
  await assertPlatformRoleChangeAllowed(client, {
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    nextRole: null,
  });
}

function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function assertTransactionalRoleActor(
  transaction: Prisma.TransactionClient,
  input: { userId: string; sessionId: string; now: Date },
) {
  const actor = await transaction.user.findUnique({
    where: { id: input.userId },
    select: {
      role: true,
      banned: true,
      banExpires: true,
      twoFactorEnabled: true,
    },
  });
  const credential = await transaction.account.findFirst({
    where: {
      userId: input.userId,
      providerId: "credential",
      password: { not: null },
    },
    select: { id: true },
  });
  const verifiedTotp = await transaction.twoFactor.findFirst({
    where: { userId: input.userId, verified: true },
    select: { id: true },
  });
  const grant = await transaction.platformRoleGrant.findUnique({
    where: { userId: input.userId },
    select: { role: true, status: true },
  });
  const session = await transaction.session.findUnique({
    where: { id: input.sessionId },
    select: {
      userId: true,
      expiresAt: true,
      platformAuthenticatedAt: true,
    },
  });
  const deletion = await transaction.platformDeletionRequest.findFirst({
    where: {
      targetType: "USER",
      targetId: input.userId,
      state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
    },
    select: { id: true },
  });
  const currentlyBanned =
    actor?.banned === true &&
    (!actor.banExpires || actor.banExpires.getTime() > input.now.getTime());
  const stepUpAge = session?.platformAuthenticatedAt
    ? input.now.getTime() - session.platformAuthenticatedAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (
    !actor ||
    deletion ||
    currentlyBanned ||
    actor.role !== "PLATFORM_SUPER_ADMIN" ||
    grant?.status !== "ACTIVE" ||
    grant.role !== "PLATFORM_SUPER_ADMIN" ||
    !credential ||
    actor.twoFactorEnabled !== true ||
    !verifiedTotp ||
    !session ||
    session.userId !== input.userId ||
    session.expiresAt.getTime() <= input.now.getTime() ||
    stepUpAge < 0 ||
    stepUpAge > platformPolicy.auth.destructiveStepUpMaxAgeMs
  ) {
    throw new PlatformSafetyError("ROLE_CHANGE_NOT_ALLOWED");
  }
}

export async function setPlatformRoleGrant(input: {
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  role: PlatformRoleName | null;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new Error("A platform role reason of 1-500 characters is required.");
  }

  const access = await authorizePlatformSession({
    userId: input.actorUserId,
    sessionId: input.actorSessionId,
    permission: "platform_role.manage",
    now,
  });
  if (!access.allowed) {
    throw new PlatformSafetyError("ROLE_CHANGE_NOT_ALLOWED");
  }
  requireRecentPlatformStepUp(access, now);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (transaction) => {
          await assertTransactionalRoleActor(transaction, {
            userId: input.actorUserId,
            sessionId: input.actorSessionId,
            now,
          });
          const target = await transaction.user.findUnique({
            where: { id: input.targetUserId },
            select: {
              id: true,
              role: true,
              banned: true,
              banExpires: true,
              twoFactorEnabled: true,
            },
          });
          const targetCredential = await transaction.account.findFirst({
            where: {
              userId: input.targetUserId,
              providerId: "credential",
              password: { not: null },
            },
            select: { id: true },
          });
          const targetVerifiedTotp = await transaction.twoFactor.findFirst({
            where: { userId: input.targetUserId, verified: true },
            select: { id: true },
          });
          const targetGrant = await transaction.platformRoleGrant.findUnique({
            where: { userId: input.targetUserId },
          });
          const targetDeletion =
            await transaction.platformDeletionRequest.findFirst({
              where: {
                targetType: "USER",
                targetId: input.targetUserId,
                state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
              },
              select: { id: true },
            });
          if (!target) {
            throw new PlatformSafetyError("ROLE_CHANGE_NOT_ALLOWED");
          }

          const currentlyBanned =
            target.banned === true &&
            (!target.banExpires || target.banExpires.getTime() > now.getTime());
          if (
            input.role &&
            (currentlyBanned ||
              targetDeletion ||
              !targetCredential ||
              target.twoFactorEnabled !== true ||
              !targetVerifiedTotp)
          ) {
            throw new PlatformSafetyError("TARGET_STRONG_AUTH_REQUIRED");
          }

          await assertPlatformRoleChangeAllowed(transaction, {
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
            nextRole: input.role,
          });

          const currentRole =
            targetGrant?.status === "ACTIVE" ? targetGrant.role : null;
          if (currentRole === input.role) {
            return { changed: false as const, role: currentRole };
          }

          let grantId = targetGrant?.id;
          if (input.role) {
            const grant = await transaction.platformRoleGrant.upsert({
              where: { userId: input.targetUserId },
              create: {
                userId: input.targetUserId,
                role: input.role,
                status: "ACTIVE",
                grantedByUserId: input.actorUserId,
                grantReason: reason,
                grantedAt: now,
              },
              update: {
                role: input.role,
                status: "ACTIVE",
                grantedByUserId: input.actorUserId,
                grantReason: reason,
                grantedAt: now,
                revokedByUserId: null,
                revokeReason: null,
                revokedAt: null,
              },
              select: { id: true },
            });
            grantId = grant.id;
          } else if (targetGrant) {
            await transaction.platformRoleGrant.update({
              where: { id: targetGrant.id },
              data: {
                status: "REVOKED",
                revokedByUserId: input.actorUserId,
                revokeReason: reason,
                revokedAt: now,
              },
            });
          }

          await transaction.user.update({
            where: { id: input.targetUserId },
            data: { role: input.role ?? "user" },
          });
          await recordPlatformAudit(
            {
              actorUserId: input.actorUserId,
              action: input.role
                ? currentRole
                  ? "platform.role.changed"
                  : "platform.role.granted"
                : "platform.role.revoked",
              targetType: "PLATFORM_ROLE_GRANT",
              targetId: grantId ?? input.targetUserId,
              reason,
              beforeMetadata: {
                role: currentRole,
                status: targetGrant?.status ?? null,
                userId: input.targetUserId,
              },
              afterMetadata: {
                role: input.role,
                status: input.role ? "ACTIVE" : "REVOKED",
                userId: input.targetUserId,
              },
            },
            transaction,
          );
          return { changed: true as const, role: input.role };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 2 && isSerializationFailure(error)) continue;
      throw error;
    }
  }
  throw new Error("Platform role update did not complete.");
}
