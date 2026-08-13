import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorizeTransactionalPlatformSession } from "@/lib/platform-access";
import { recordPlatformAudit } from "@/lib/platform-audit";
import { platformPolicy } from "@/lib/platform-policy";
import {
  runSerializableTransaction,
  type TransactionClient,
} from "@/lib/serializable-transaction";

type QuotaReadClient = Pick<
  Prisma.TransactionClient,
  "platformQuotaDefault" | "userQuotaOverride" | "boothQuotaOverride"
>;

export const platformQuotaBounds = {
  maxOwnedBooths: 1_000,
  maxTeamSeats: 10_000,
  maxProducts: 1_000_000,
  maxFaceboothProjects: 100_000,
  maxStorageBytes: BigInt(1_024) ** BigInt(5),
} as const;

export type EffectiveBoothQuotas = {
  maxTeamSeats: number;
  maxProducts: number;
  maxFaceboothProjects: number;
  maxStorageBytes: bigint;
};

export class PlatformQuotaMutationError extends Error {
  constructor(
    public readonly code:
      | "AUTHORIZATION_DENIED"
      | "INVALID_REASON"
      | "INVALID_TARGET"
      | "INVALID_VALUE"
      | "TARGET_NOT_FOUND",
  ) {
    super(code);
    this.name = "PlatformQuotaMutationError";
  }
}

function boundedReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 500) {
    throw new PlatformQuotaMutationError("INVALID_REASON");
  }
  return normalized;
}

function boundedTargetId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) {
    throw new PlatformQuotaMutationError("INVALID_TARGET");
  }
  return normalized;
}

function validInteger(value: number, maximum: number) {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

function assertUserQuotaValue(value: number | null) {
  if (
    value !== null &&
    !validInteger(value, platformQuotaBounds.maxOwnedBooths)
  ) {
    throw new PlatformQuotaMutationError("INVALID_VALUE");
  }
}

function assertBoothQuotaValues(values: {
  maxTeamSeats: number | null;
  maxProducts: number | null;
  maxFaceboothProjects: number | null;
  maxStorageBytes: bigint | null;
}) {
  if (
    (values.maxTeamSeats !== null &&
      !validInteger(values.maxTeamSeats, platformQuotaBounds.maxTeamSeats)) ||
    (values.maxProducts !== null &&
      !validInteger(values.maxProducts, platformQuotaBounds.maxProducts)) ||
    (values.maxFaceboothProjects !== null &&
      !validInteger(
        values.maxFaceboothProjects,
        platformQuotaBounds.maxFaceboothProjects,
      )) ||
    (values.maxStorageBytes !== null &&
      (values.maxStorageBytes < BigInt(1) ||
        values.maxStorageBytes > platformQuotaBounds.maxStorageBytes))
  ) {
    throw new PlatformQuotaMutationError("INVALID_VALUE");
  }
}

async function requireTransactionalQuotaManager(
  transaction: TransactionClient,
  actor: { actorUserId: string; actorSessionId: string },
) {
  const access = await authorizeTransactionalPlatformSession(transaction, {
    userId: actor.actorUserId,
    sessionId: actor.actorSessionId,
    permission: "quota.manage",
  });
  if (!access.allowed) {
    throw new PlatformQuotaMutationError("AUTHORIZATION_DENIED");
  }
  return access;
}

export async function readPlatformQuotaDefaults(client: QuotaReadClient = db) {
  const stored = await client.platformQuotaDefault.findUnique({
    where: { id: "global" },
    select: {
      maxOwnedBooths: true,
      maxTeamSeats: true,
      maxProducts: true,
      maxFaceboothProjects: true,
      maxStorageBytes: true,
      updatedAt: true,
    },
  });
  return (
    stored ?? {
      ...platformPolicy.quotaDefaults,
      updatedAt: null,
    }
  );
}

export async function readEffectiveUserOwnedBoothQuota(
  transaction: TransactionClient,
  userId: string,
) {
  const defaults = await readPlatformQuotaDefaults(transaction);
  const override = await transaction.userQuotaOverride.findUnique({
    where: { userId },
    select: { maxOwnedBooths: true },
  });
  return override?.maxOwnedBooths ?? defaults.maxOwnedBooths;
}

export async function readEffectiveBoothQuotas(
  transaction: TransactionClient,
  boothId: string,
): Promise<EffectiveBoothQuotas> {
  const defaults = await readPlatformQuotaDefaults(transaction);
  const override = await transaction.boothQuotaOverride.findUnique({
    where: { boothId },
    select: {
      maxTeamSeats: true,
      maxProducts: true,
      maxFaceboothProjects: true,
      maxStorageBytes: true,
    },
  });
  return {
    maxTeamSeats: override?.maxTeamSeats ?? defaults.maxTeamSeats,
    maxProducts: override?.maxProducts ?? defaults.maxProducts,
    maxFaceboothProjects:
      override?.maxFaceboothProjects ?? defaults.maxFaceboothProjects,
    maxStorageBytes: override?.maxStorageBytes ?? defaults.maxStorageBytes,
  };
}

export async function checkOwnedBoothQuota(
  transaction: TransactionClient,
  userId: string,
  additionalBooths = 1,
) {
  const limit = await readEffectiveUserOwnedBoothQuota(transaction, userId);
  const usage = await transaction.booth.count({ where: { ownerId: userId } });
  return { allowed: usage + additionalBooths <= limit, limit, usage };
}

export async function checkTeamSeatQuota(
  transaction: TransactionClient,
  boothId: string,
  now: Date,
  additionalSeats = 1,
) {
  const quota = await readEffectiveBoothQuotas(transaction, boothId);
  const activeMembers = await transaction.boothMembership.count({
    where: { boothId, status: "ACTIVE" },
  });
  const pendingInvitations = await transaction.teamInvitation.count({
    where: {
      boothId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });
  const usage = activeMembers + pendingInvitations;
  return {
    allowed: usage + additionalSeats <= quota.maxTeamSeats,
    limit: quota.maxTeamSeats,
    usage,
  };
}

export async function checkProductQuota(
  transaction: TransactionClient,
  boothId: string,
  additionalProducts = 1,
) {
  const quota = await readEffectiveBoothQuotas(transaction, boothId);
  const usage = await transaction.product.count({ where: { boothId } });
  return {
    allowed: usage + additionalProducts <= quota.maxProducts,
    limit: quota.maxProducts,
    usage,
  };
}

export async function checkFaceboothProjectQuota(
  transaction: TransactionClient,
  boothId: string,
  additionalProjects = 1,
) {
  const quota = await readEffectiveBoothQuotas(transaction, boothId);
  const usage = await transaction.faceboothProject.count({
    where: { boothId },
  });
  return {
    allowed: usage + additionalProjects <= quota.maxFaceboothProjects,
    limit: quota.maxFaceboothProjects,
    usage,
  };
}

export async function updateUserQuotaOverride(input: {
  actorUserId: string;
  actorSessionId: string;
  targetUserId: string;
  maxOwnedBooths: number | null;
  reason: string;
}) {
  const targetUserId = boundedTargetId(input.targetUserId);
  const reason = boundedReason(input.reason);
  assertUserQuotaValue(input.maxOwnedBooths);

  return runSerializableTransaction(async (transaction) => {
    await requireTransactionalQuotaManager(transaction, input);
    const target = await transaction.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    const defaults = await readPlatformQuotaDefaults(transaction);
    const existing = await transaction.userQuotaOverride.findUnique({
      where: { userId: targetUserId },
      select: { maxOwnedBooths: true },
    });
    if (!target) throw new PlatformQuotaMutationError("TARGET_NOT_FOUND");
    if (existing?.maxOwnedBooths === input.maxOwnedBooths) {
      return {
        status: "NO_CHANGE",
        configured: input.maxOwnedBooths,
        effective: input.maxOwnedBooths ?? defaults.maxOwnedBooths,
      } as const;
    }

    if (input.maxOwnedBooths === null) {
      await transaction.userQuotaOverride.deleteMany({
        where: { userId: targetUserId },
      });
    } else {
      await transaction.userQuotaOverride.upsert({
        where: { userId: targetUserId },
        create: {
          userId: targetUserId,
          maxOwnedBooths: input.maxOwnedBooths,
          updatedByUserId: input.actorUserId,
          reason,
        },
        update: {
          maxOwnedBooths: input.maxOwnedBooths,
          updatedByUserId: input.actorUserId,
          reason,
        },
      });
    }
    const effective = input.maxOwnedBooths ?? defaults.maxOwnedBooths;
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "quota.user.updated",
        targetType: "QUOTA",
        targetId: targetUserId,
        reason,
        beforeMetadata: {
          maxOwnedBooths: existing?.maxOwnedBooths ?? null,
        },
        afterMetadata: {
          maxOwnedBooths: input.maxOwnedBooths,
          effectiveMaxOwnedBooths: effective,
        },
      },
      transaction,
    );
    return {
      status: "UPDATED",
      configured: input.maxOwnedBooths,
      effective,
    } as const;
  });
}

export async function updatePlatformQuotaDefaults(input: {
  actorUserId: string;
  actorSessionId: string;
  maxOwnedBooths: number;
  maxTeamSeats: number;
  maxProducts: number;
  maxFaceboothProjects: number;
  maxStorageBytes: bigint;
  reason: string;
}) {
  const reason = boundedReason(input.reason);
  assertUserQuotaValue(input.maxOwnedBooths);
  assertBoothQuotaValues({
    maxTeamSeats: input.maxTeamSeats,
    maxProducts: input.maxProducts,
    maxFaceboothProjects: input.maxFaceboothProjects,
    maxStorageBytes: input.maxStorageBytes,
  });

  return runSerializableTransaction(async (transaction) => {
    await requireTransactionalQuotaManager(transaction, input);
    const previous = await readPlatformQuotaDefaults(transaction);
    const values = {
      maxOwnedBooths: input.maxOwnedBooths,
      maxTeamSeats: input.maxTeamSeats,
      maxProducts: input.maxProducts,
      maxFaceboothProjects: input.maxFaceboothProjects,
      maxStorageBytes: input.maxStorageBytes,
    };
    const unchanged =
      previous.maxOwnedBooths === values.maxOwnedBooths &&
      previous.maxTeamSeats === values.maxTeamSeats &&
      previous.maxProducts === values.maxProducts &&
      previous.maxFaceboothProjects === values.maxFaceboothProjects &&
      previous.maxStorageBytes === values.maxStorageBytes;
    if (unchanged) return { status: "NO_CHANGE", values } as const;

    await transaction.platformQuotaDefault.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        ...values,
        updatedByUserId: input.actorUserId,
        updateReason: reason,
      },
      update: {
        ...values,
        updatedByUserId: input.actorUserId,
        updateReason: reason,
      },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "quota.defaults.updated",
        targetType: "QUOTA",
        targetId: "global",
        reason,
        beforeMetadata: previous,
        afterMetadata: values,
      },
      transaction,
    );
    return { status: "UPDATED", values } as const;
  });
}

export async function updateBoothQuotaOverride(input: {
  actorUserId: string;
  actorSessionId: string;
  boothId: string;
  maxTeamSeats: number | null;
  maxProducts: number | null;
  maxFaceboothProjects: number | null;
  maxStorageBytes: bigint | null;
  reason: string;
}) {
  const boothId = boundedTargetId(input.boothId);
  const reason = boundedReason(input.reason);
  const values = {
    maxTeamSeats: input.maxTeamSeats,
    maxProducts: input.maxProducts,
    maxFaceboothProjects: input.maxFaceboothProjects,
    maxStorageBytes: input.maxStorageBytes,
  };
  assertBoothQuotaValues(values);

  return runSerializableTransaction(async (transaction) => {
    await requireTransactionalQuotaManager(transaction, input);
    const target = await transaction.booth.findUnique({
      where: { id: boothId },
      select: { id: true },
    });
    const defaults = await readPlatformQuotaDefaults(transaction);
    const existing = await transaction.boothQuotaOverride.findUnique({
      where: { boothId },
      select: {
        maxTeamSeats: true,
        maxProducts: true,
        maxFaceboothProjects: true,
        maxStorageBytes: true,
      },
    });
    if (!target) throw new PlatformQuotaMutationError("TARGET_NOT_FOUND");
    const previous = existing ?? {
      maxTeamSeats: null,
      maxProducts: null,
      maxFaceboothProjects: null,
      maxStorageBytes: null,
    };
    const unchanged =
      previous.maxTeamSeats === values.maxTeamSeats &&
      previous.maxProducts === values.maxProducts &&
      previous.maxFaceboothProjects === values.maxFaceboothProjects &&
      previous.maxStorageBytes === values.maxStorageBytes;
    const effective = {
      maxTeamSeats: values.maxTeamSeats ?? defaults.maxTeamSeats,
      maxProducts: values.maxProducts ?? defaults.maxProducts,
      maxFaceboothProjects:
        values.maxFaceboothProjects ?? defaults.maxFaceboothProjects,
      maxStorageBytes: values.maxStorageBytes ?? defaults.maxStorageBytes,
    };
    if (unchanged) {
      return { status: "NO_CHANGE", configured: values, effective } as const;
    }

    const hasOverride = Object.values(values).some((value) => value !== null);
    if (!hasOverride) {
      await transaction.boothQuotaOverride.deleteMany({ where: { boothId } });
    } else {
      await transaction.boothQuotaOverride.upsert({
        where: { boothId },
        create: {
          boothId,
          ...values,
          updatedByUserId: input.actorUserId,
          reason,
        },
        update: {
          ...values,
          updatedByUserId: input.actorUserId,
          reason,
        },
      });
    }
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "quota.booth.updated",
        targetType: "QUOTA",
        targetId: boothId,
        reason,
        beforeMetadata: previous,
        afterMetadata: { ...values, effective },
      },
      transaction,
    );
    return { status: "UPDATED", configured: values, effective } as const;
  });
}
