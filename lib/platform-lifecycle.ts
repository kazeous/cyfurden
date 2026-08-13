import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  collectFaceboothArtworkObjectKeys,
  parseFaceboothProjectDocument,
  parseFaceboothPublicationDocument,
} from "@/lib/facebooth-documents";
import {
  assertPlatformUserDestructiveActionAllowed,
  authorizeTransactionalPlatformSession,
  PlatformSafetyError,
  requireRecentPlatformStepUp,
} from "@/lib/platform-access";
import { recordPlatformAudit } from "@/lib/platform-audit";
import { platformPolicy, type PlatformPermission } from "@/lib/platform-policy";

const openDeletionStates = ["PENDING", "FINALIZING", "BLOCKED"] as const;
const cancellableDeletionStates = ["PENDING", "BLOCKED"] as const;

export type PlatformLifecycleErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONCURRENT_UPDATE"
  | "CONFIRMATION_MISMATCH"
  | "COOLING_OFF_ACTIVE"
  | "INVALID_EXPIRY"
  | "INVALID_MEMBERSHIP_INPUT"
  | "INVALID_REASON"
  | "INVALID_SNAPSHOT"
  | "LAST_SUPER_ADMIN"
  | "MEMBERSHIP_NOT_FOUND"
  | "NO_CHANGE"
  | "OWNER_PROTECTED"
  | "PROVIDER_DELETE_FAILED"
  | "RECIPIENT_UNAVAILABLE"
  | "SELF_LOCKOUT"
  | "STALE_TARGET_VERSION"
  | "STATE_CONFLICT"
  | "STEP_UP_REQUIRED"
  | "TARGET_NOT_FOUND";

export class PlatformLifecycleError extends Error {
  constructor(public readonly code: PlatformLifecycleErrorCode) {
    super(code);
    this.name = "PlatformLifecycleError";
  }
}

type LifecycleActor = {
  actorUserId: string;
  actorSessionId: string;
};

type DeletionTarget =
  | { targetType: "USER"; targetId: string }
  | { targetType: "BOOTH"; targetId: string; expectedVersion?: number };

export type PlatformObjectDeleter = (objectKeys: Iterable<string>) => Promise<{
  deletedObjectKeys: string[];
  failedObjectKeys: string[];
  safeErrorCode: "ORACLE_DELETE_FAILED" | "ORACLE_NOT_CONFIGURED" | null;
}>;

function normalizeReason(reason: string) {
  const normalized = reason.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 500) {
    throw new PlatformLifecycleError("INVALID_REASON");
  }
  return normalized;
}

function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function withSerializableRetry<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (attempt < 2 && isSerializationFailure(error)) continue;
      if (isSerializationFailure(error)) {
        throw new PlatformLifecycleError("CONCURRENT_UPDATE");
      }
      throw error;
    }
  }
  throw new PlatformLifecycleError("CONCURRENT_UPDATE");
}

async function requireLifecycleAccess(
  transaction: Prisma.TransactionClient,
  input: LifecycleActor & {
    permission: PlatformPermission;
    now: Date;
    recentStepUp?: boolean;
  },
) {
  const access = await authorizeTransactionalPlatformSession(transaction, {
    userId: input.actorUserId,
    sessionId: input.actorSessionId,
    permission: input.permission,
    now: input.now,
  });
  if (!access.allowed) {
    throw new PlatformLifecycleError("AUTHORIZATION_DENIED");
  }
  if (input.recentStepUp) {
    try {
      requireRecentPlatformStepUp(access, input.now);
    } catch {
      throw new PlatformLifecycleError("STEP_UP_REQUIRED");
    }
  }
  return access;
}

function mapSafetyError(error: unknown): never {
  if (error instanceof PlatformSafetyError) {
    if (error.code === "LAST_SUPER_ADMIN") {
      throw new PlatformLifecycleError("LAST_SUPER_ADMIN");
    }
    if (
      error.code === "SELF_FINAL_GRANT" ||
      error.code === "SELF_DELETION_FINALIZATION"
    ) {
      throw new PlatformLifecycleError("SELF_LOCKOUT");
    }
  }
  throw error;
}

function currentlySuspended(
  user: { banned: boolean | null; banExpires: Date | null },
  now: Date,
) {
  return (
    user.banned === true &&
    (!user.banExpires || user.banExpires.getTime() > now.getTime())
  );
}

async function findOpenDeletionRequest(
  transaction: Prisma.TransactionClient,
  targetType: "USER" | "BOOTH",
  targetId: string,
) {
  return transaction.platformDeletionRequest.findFirst({
    where: {
      targetType,
      targetId,
      state: { in: [...openDeletionStates] },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
  });
}

export async function suspendPlatformUser(
  input: LifecycleActor & {
    targetUserId: string;
    reason: string;
    banExpires?: Date | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  const banExpires = input.banExpires ?? null;
  if (
    banExpires &&
    (!Number.isFinite(banExpires.getTime()) ||
      banExpires.getTime() <= now.getTime())
  ) {
    throw new PlatformLifecycleError("INVALID_EXPIRY");
  }

  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "user.suspend",
      now,
    });
    const [target, deletion] = await Promise.all([
      transaction.user.findUnique({
        where: { id: input.targetUserId },
        select: {
          id: true,
          banned: true,
          banReason: true,
          banExpires: true,
        },
      }),
      findOpenDeletionRequest(transaction, "USER", input.targetUserId),
    ]);
    if (!target) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (deletion || currentlySuspended(target, now)) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    try {
      await assertPlatformUserDestructiveActionAllowed(transaction, {
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        action: "SUSPEND",
      });
    } catch (error) {
      mapSafetyError(error);
    }

    const revokedSessions = await transaction.session.deleteMany({
      where: { userId: input.targetUserId },
    });
    await transaction.user.update({
      where: { id: input.targetUserId },
      data: { banned: true, banReason: reason, banExpires },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "platform.user.suspended",
        targetType: "USER",
        targetId: input.targetUserId,
        reason,
        beforeMetadata: {
          state: "ACTIVE",
          banExpires: target.banExpires,
        },
        afterMetadata: {
          state: "SUSPENDED",
          banExpires,
          revokedSessions: revokedSessions.count,
        },
      },
      transaction,
    );
    return {
      status: "SUSPENDED" as const,
      revokedSessions: revokedSessions.count,
    };
  });
}

export async function restorePlatformUser(
  input: LifecycleActor & {
    targetUserId: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "user.suspend",
      now,
    });
    const [target, deletion] = await Promise.all([
      transaction.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, banned: true, banReason: true, banExpires: true },
      }),
      findOpenDeletionRequest(transaction, "USER", input.targetUserId),
    ]);
    if (!target) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (deletion || !currentlySuspended(target, now)) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    await transaction.user.update({
      where: { id: input.targetUserId },
      data: { banned: false, banReason: null, banExpires: null },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "platform.user.restored",
        targetType: "USER",
        targetId: input.targetUserId,
        reason,
        beforeMetadata: {
          state: "SUSPENDED",
          banExpires: target.banExpires,
        },
        afterMetadata: { state: "ACTIVE" },
      },
      transaction,
    );
    return { status: "ACTIVE" as const };
  });
}

export async function revokePlatformUserSessions(
  input: LifecycleActor & {
    targetUserId: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "user.session.revoke",
      now,
    });
    const target = await transaction.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });
    if (!target) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    const revoked = await transaction.session.deleteMany({
      where: { userId: input.targetUserId },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "platform.user.sessions_revoked",
        targetType: "USER",
        targetId: input.targetUserId,
        reason,
        beforeMetadata: { activeSessions: revoked.count },
        afterMetadata: { activeSessions: 0 },
      },
      transaction,
    );
    return { status: "REVOKED" as const, revokedSessions: revoked.count };
  });
}

async function transitionBoothService(
  input: LifecycleActor & {
    boothId: string;
    expectedVersion: number;
    reason: string;
    nextState: "ACTIVE" | "SUSPENDED";
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "booth.suspend",
      now,
    });
    const booth = await transaction.booth.findUnique({
      where: { id: input.boothId },
      select: {
        id: true,
        serviceState: true,
        serviceReason: true,
        serviceVersion: true,
      },
    });
    if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (booth.serviceVersion !== input.expectedVersion) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    const expectedState =
      input.nextState === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (booth.serviceState !== expectedState) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }

    const updated = await transaction.booth.updateMany({
      where: {
        id: input.boothId,
        serviceState: expectedState,
        serviceVersion: input.expectedVersion,
      },
      data: {
        serviceState: input.nextState,
        serviceReason: input.nextState === "SUSPENDED" ? reason : null,
        serviceStateChangedByUserId: input.actorUserId,
        serviceStateChangedAt: now,
        serviceVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action:
          input.nextState === "SUSPENDED"
            ? "platform.booth.suspended"
            : "platform.booth.restored",
        targetType: "BOOTH",
        targetId: input.boothId,
        reason,
        beforeMetadata: {
          state: booth.serviceState,
          serviceVersion: booth.serviceVersion,
        },
        afterMetadata: {
          state: input.nextState,
          serviceVersion: booth.serviceVersion + 1,
        },
      },
      transaction,
    );
    return {
      status: input.nextState,
      serviceVersion: booth.serviceVersion + 1,
    };
  });
}

export function suspendPlatformBooth(
  input: LifecycleActor & {
    boothId: string;
    expectedVersion: number;
    reason: string;
    now?: Date;
  },
) {
  return transitionBoothService({ ...input, nextState: "SUSPENDED" });
}

export function restorePlatformBooth(
  input: LifecycleActor & {
    boothId: string;
    expectedVersion: number;
    reason: string;
    now?: Date;
  },
) {
  return transitionBoothService({ ...input, nextState: "ACTIVE" });
}

export async function restrictPlatformMembership(
  input: LifecycleActor & {
    boothId: string;
    membershipId: string;
    role: "ADMIN" | "STAFF";
    status: "ACTIVE" | "DISABLED";
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  if (
    !["ADMIN", "STAFF"].includes(input.role) ||
    !["ACTIVE", "DISABLED"].includes(input.status)
  ) {
    throw new PlatformLifecycleError("INVALID_MEMBERSHIP_INPUT");
  }
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "membership.manage",
      now,
    });
    const booth = await transaction.booth.findUnique({
      where: { id: input.boothId },
      select: { id: true, ownerId: true, serviceState: true },
    });
    if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (booth.serviceState !== "ACTIVE") {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    const membership = await transaction.boothMembership.findFirst({
      where: { id: input.membershipId, boothId: input.boothId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!membership) {
      throw new PlatformLifecycleError("MEMBERSHIP_NOT_FOUND");
    }
    if (membership.role === "OWNER" || membership.userId === booth.ownerId) {
      throw new PlatformLifecycleError("OWNER_PROTECTED");
    }
    if (membership.role === input.role && membership.status === input.status) {
      throw new PlatformLifecycleError("NO_CHANGE");
    }
    await transaction.boothMembership.update({
      where: { id: membership.id },
      data: { role: input.role, status: input.status },
    });
    const correlationId = randomUUID();
    const auditInput = {
      actorUserId: input.actorUserId,
      action: "platform.membership.updated",
      reason,
      correlationId,
      beforeMetadata: {
        role: membership.role,
        status: membership.status,
        targetBoothId: input.boothId,
      },
      afterMetadata: {
        role: input.role,
        status: input.status,
        targetBoothId: input.boothId,
      },
    } as const;
    await Promise.all([
      recordPlatformAudit(
        {
          ...auditInput,
          targetType: "MEMBERSHIP",
          targetId: membership.id,
        },
        transaction,
      ),
      recordPlatformAudit(
        {
          ...auditInput,
          targetType: "BOOTH",
          targetId: input.boothId,
        },
        transaction,
      ),
    ]);
    return { status: "UPDATED" as const };
  });
}

async function readOwnershipTransferTarget(
  transaction: Prisma.TransactionClient,
  boothId: string,
  recipientUserId: string,
  now = new Date(),
) {
  const booth = await transaction.booth.findUnique({
    where: { id: boothId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      serviceState: true,
      serviceVersion: true,
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        where: { userId: recipientUserId },
        select: {
          id: true,
          role: true,
          status: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              banned: true,
              banExpires: true,
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
  if (booth.serviceState !== "ACTIVE") {
    throw new PlatformLifecycleError("STATE_CONFLICT");
  }
  if (booth.ownerId === recipientUserId) {
    throw new PlatformLifecycleError("NO_CHANGE");
  }
  const membership = booth.memberships[0];
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.role === "OWNER" ||
    currentlySuspended(membership.user, now)
  ) {
    throw new PlatformLifecycleError("RECIPIENT_UNAVAILABLE");
  }
  const deletion = await findOpenDeletionRequest(
    transaction,
    "USER",
    recipientUserId,
  );
  if (deletion) throw new PlatformLifecycleError("RECIPIENT_UNAVAILABLE");
  return { booth, membership };
}

export async function previewPlatformOwnershipTransfer(
  input: LifecycleActor & {
    boothId: string;
    recipientUserId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "ownership.transfer",
      now,
    });
    const { booth, membership } = await readOwnershipTransferTarget(
      transaction,
      input.boothId,
      input.recipientUserId,
      now,
    );
    return {
      booth: {
        id: booth.id,
        name: booth.name,
        slug: booth.slug,
        serviceVersion: booth.serviceVersion,
      },
      currentOwner: booth.owner,
      recipient: membership.user,
      recipientMembershipId: membership.id,
      recipientCurrentRole: membership.role,
      formerOwnerNextRole: "ADMIN" as const,
      confirmation: booth.slug,
    };
  });
}

export async function finalizePlatformOwnershipTransfer(
  input: LifecycleActor & {
    boothId: string;
    recipientUserId: string;
    expectedVersion: number;
    confirmation: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "ownership.transfer",
      now,
      recentStepUp: true,
    });
    const { booth, membership } = await readOwnershipTransferTarget(
      transaction,
      input.boothId,
      input.recipientUserId,
      now,
    );
    if (booth.serviceVersion !== input.expectedVersion) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    if (input.confirmation !== booth.slug) {
      throw new PlatformLifecycleError("CONFIRMATION_MISMATCH");
    }
    const formerOwnerMembership = await transaction.boothMembership.findFirst({
      where: {
        boothId: booth.id,
        userId: booth.ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!formerOwnerMembership) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }

    const demoted = await transaction.boothMembership.updateMany({
      where: {
        id: formerOwnerMembership.id,
        boothId: booth.id,
        userId: booth.ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
      data: { role: "ADMIN", status: "ACTIVE" },
    });
    const promoted = await transaction.boothMembership.updateMany({
      where: {
        id: membership.id,
        boothId: booth.id,
        userId: input.recipientUserId,
        role: { in: ["ADMIN", "STAFF"] },
        status: "ACTIVE",
      },
      data: { role: "OWNER", status: "ACTIVE" },
    });
    const updatedBooth = await transaction.booth.updateMany({
      where: {
        id: booth.id,
        ownerId: booth.ownerId,
        serviceState: "ACTIVE",
        serviceVersion: input.expectedVersion,
      },
      data: {
        ownerId: input.recipientUserId,
        serviceStateChangedByUserId: input.actorUserId,
        serviceStateChangedAt: now,
        serviceVersion: { increment: 1 },
      },
    });
    if (
      demoted.count !== 1 ||
      promoted.count !== 1 ||
      updatedBooth.count !== 1
    ) {
      throw new PlatformLifecycleError("CONCURRENT_UPDATE");
    }
    const owners = await transaction.boothMembership.findMany({
      where: { boothId: booth.id, role: "OWNER", status: "ACTIVE" },
      select: { userId: true },
    });
    if (owners.length !== 1 || owners[0]?.userId !== input.recipientUserId) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }

    const correlationId = randomUUID();
    const metadata = {
      previousOwnerUserId: booth.ownerId,
      nextOwnerUserId: input.recipientUserId,
      formerOwnerNextRole: "ADMIN",
      serviceVersion: booth.serviceVersion + 1,
    };
    await Promise.all([
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.booth.ownership_transferred",
          targetType: "BOOTH",
          targetId: booth.id,
          reason,
          correlationId,
          beforeMetadata: {
            ownerUserId: booth.ownerId,
            serviceVersion: booth.serviceVersion,
          },
          afterMetadata: metadata,
        },
        transaction,
      ),
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.membership.owner_demoted",
          targetType: "MEMBERSHIP",
          targetId: formerOwnerMembership.id,
          reason,
          correlationId,
          beforeMetadata: { role: "OWNER", status: "ACTIVE" },
          afterMetadata: { role: "ADMIN", status: "ACTIVE" },
        },
        transaction,
      ),
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.membership.owner_promoted",
          targetType: "MEMBERSHIP",
          targetId: membership.id,
          reason,
          correlationId,
          beforeMetadata: { role: membership.role, status: membership.status },
          afterMetadata: { role: "OWNER", status: "ACTIVE" },
        },
        transaction,
      ),
    ]);
    return {
      status: "TRANSFERRED" as const,
      serviceVersion: booth.serviceVersion + 1,
    };
  });
}

async function readUserDeletionBlockers(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      _count: {
        select: {
          ownedBooths: true,
          invitationsSent: true,
          faceboothProjectsCreated: true,
          faceboothProjectsUpdated: true,
          faceboothPublications: true,
          auditLogs: true,
        },
      },
    },
  });
  if (!user) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
  const retainedReferences =
    user._count.invitationsSent +
    user._count.faceboothProjectsCreated +
    user._count.faceboothProjectsUpdated +
    user._count.faceboothPublications +
    user._count.auditLogs;
  return {
    user,
    blockers: {
      ownedBooths: user._count.ownedBooths,
      retainedReferences,
      invitationReferences: user._count.invitationsSent,
      faceboothProjectReferences:
        user._count.faceboothProjectsCreated +
        user._count.faceboothProjectsUpdated,
      faceboothPublicationReferences: user._count.faceboothPublications,
      boothAuditReferences: user._count.auditLogs,
    },
  };
}

async function readBoothDeletionAssets(
  transaction: Prisma.TransactionClient,
  boothId: string,
) {
  const booth = await transaction.booth.findUnique({
    where: { id: boothId },
    select: {
      id: true,
      name: true,
      slug: true,
      serviceState: true,
      serviceVersion: true,
      logoObjectKey: true,
      paymentInstructions: { select: { qrObjectKey: true } },
      products: { select: { images: { select: { objectKey: true } } } },
      faceboothProjects: {
        select: { kind: true, document: true, previewObjectKey: true },
      },
      faceboothPublication: {
        select: { document: true, previewObjectKey: true },
      },
      storageAssets: { select: { objectKey: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");

  const objectKeys = new Set<string>();
  if (booth.logoObjectKey) objectKeys.add(booth.logoObjectKey);
  if (booth.paymentInstructions?.qrObjectKey) {
    objectKeys.add(booth.paymentInstructions.qrObjectKey);
  }
  for (const product of booth.products) {
    for (const image of product.images) objectKeys.add(image.objectKey);
  }
  let invalidFaceboothDocuments = 0;
  for (const project of booth.faceboothProjects) {
    if (project.previewObjectKey) objectKeys.add(project.previewObjectKey);
    const document = parseFaceboothProjectDocument(
      project.kind,
      project.document,
    );
    if (!document) {
      invalidFaceboothDocuments += 1;
      continue;
    }
    for (const objectKey of collectFaceboothArtworkObjectKeys(document)) {
      objectKeys.add(objectKey);
    }
  }
  if (booth.faceboothPublication) {
    if (booth.faceboothPublication.previewObjectKey) {
      objectKeys.add(booth.faceboothPublication.previewObjectKey);
    }
    const publication = parseFaceboothPublicationDocument(
      booth.faceboothPublication.document,
    );
    if (!publication) {
      invalidFaceboothDocuments += 1;
    } else {
      if (publication.previewObjectKey) {
        objectKeys.add(publication.previewObjectKey);
      }
      for (const objectKey of collectFaceboothArtworkObjectKeys(
        publication.scene.document,
      )) {
        objectKeys.add(objectKey);
      }
      for (const merch of publication.merch) {
        for (const objectKey of collectFaceboothArtworkObjectKeys(
          merch.document,
        )) {
          objectKeys.add(objectKey);
        }
      }
    }
  }
  for (const asset of booth.storageAssets) objectKeys.add(asset.objectKey);
  return {
    booth,
    objectKeys,
    blockers: {
      retainedOrderReferences: booth._count.orders,
      invalidFaceboothDocuments,
      oracleObjectCount: objectKeys.size,
    },
  };
}

export async function previewPlatformDeletion(
  input: LifecycleActor & DeletionTarget & { now?: Date },
) {
  const now = input.now ?? new Date();
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.request",
      now,
    });
    const request = await findOpenDeletionRequest(
      transaction,
      input.targetType,
      input.targetId,
    );
    if (input.targetType === "USER") {
      const { user, blockers } = await readUserDeletionBlockers(
        transaction,
        input.targetId,
      );
      return {
        targetType: "USER" as const,
        targetId: user.id,
        confirmation: user.email,
        blockers,
        request: request
          ? {
              id: request.id,
              state: request.state,
              coolingOffEndsAt: request.coolingOffEndsAt,
            }
          : null,
      };
    }
    const { booth, blockers } = await readBoothDeletionAssets(
      transaction,
      input.targetId,
    );
    return {
      targetType: "BOOTH" as const,
      targetId: booth.id,
      confirmation: booth.slug,
      serviceVersion: booth.serviceVersion,
      blockers,
      request: request
        ? {
            id: request.id,
            state: request.state,
            coolingOffEndsAt: request.coolingOffEndsAt,
          }
        : null,
    };
  });
}

function userDeletionSnapshot(user: {
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
}) {
  return {
    snapshotVersion: 1,
    targetType: "USER",
    priorState: {
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires?.toISOString() ?? null,
    },
  };
}

function boothDeletionSnapshot(booth: {
  serviceState: "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";
  serviceReason: string | null;
}) {
  return {
    snapshotVersion: 1,
    targetType: "BOOTH",
    priorState: {
      serviceState: booth.serviceState,
      serviceReason: booth.serviceReason,
    },
  };
}

export async function requestPlatformDeletion(
  input: LifecycleActor & DeletionTarget & { reason: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.request",
      now,
    });
    if (
      await findOpenDeletionRequest(
        transaction,
        input.targetType,
        input.targetId,
      )
    ) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    const coolingOffEndsAt = new Date(
      now.getTime() + platformPolicy.deletion.coolingOffMs,
    );
    const correlationId = randomUUID();

    if (input.targetType === "USER") {
      const target = await transaction.user.findUnique({
        where: { id: input.targetId },
        select: { id: true, banned: true, banReason: true, banExpires: true },
      });
      if (!target) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
      try {
        await assertPlatformUserDestructiveActionAllowed(transaction, {
          actorUserId: input.actorUserId,
          targetUserId: input.targetId,
          action: "SUSPEND",
        });
      } catch (error) {
        mapSafetyError(error);
      }
      const revoked = await transaction.session.deleteMany({
        where: { userId: input.targetId },
      });
      await transaction.user.update({
        where: { id: input.targetId },
        data: { banned: true, banReason: reason, banExpires: null },
      });
      const request = await transaction.platformDeletionRequest.create({
        data: {
          targetType: "USER",
          targetId: input.targetId,
          requestedByUserId: input.actorUserId,
          reason,
          requestedAt: now,
          coolingOffEndsAt,
          blockers: userDeletionSnapshot(target),
        },
      });
      await Promise.all([
        recordPlatformAudit(
          {
            actorUserId: input.actorUserId,
            action: "platform.deletion.requested",
            targetType: "DELETION_REQUEST",
            targetId: request.id,
            reason,
            correlationId,
            afterMetadata: {
              targetUserId: input.targetId,
              state: "PENDING",
              coolingOffEndsAt,
            },
          },
          transaction,
        ),
        recordPlatformAudit(
          {
            actorUserId: input.actorUserId,
            action: "platform.user.deletion_pending",
            targetType: "USER",
            targetId: input.targetId,
            reason,
            correlationId,
            beforeMetadata: {
              state: currentlySuspended(target, now) ? "SUSPENDED" : "ACTIVE",
            },
            afterMetadata: {
              state: "DELETION_PENDING",
              revokedSessions: revoked.count,
            },
          },
          transaction,
        ),
      ]);
      return {
        status: "PENDING" as const,
        requestId: request.id,
        coolingOffEndsAt,
      };
    }

    const booth = await transaction.booth.findUnique({
      where: { id: input.targetId },
      select: {
        id: true,
        serviceState: true,
        serviceReason: true,
        serviceVersion: true,
      },
    });
    if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (booth.serviceState === "DELETION_PENDING") {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    if (
      input.expectedVersion === undefined ||
      booth.serviceVersion !== input.expectedVersion
    ) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    const updated = await transaction.booth.updateMany({
      where: {
        id: booth.id,
        serviceVersion: input.expectedVersion,
        serviceState: booth.serviceState,
      },
      data: {
        serviceState: "DELETION_PENDING",
        serviceReason: reason,
        serviceStateChangedByUserId: input.actorUserId,
        serviceStateChangedAt: now,
        serviceVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    const request = await transaction.platformDeletionRequest.create({
      data: {
        targetType: "BOOTH",
        targetId: booth.id,
        requestedByUserId: input.actorUserId,
        reason,
        requestedAt: now,
        coolingOffEndsAt,
        blockers: boothDeletionSnapshot(booth),
      },
    });
    await Promise.all([
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.deletion.requested",
          targetType: "DELETION_REQUEST",
          targetId: request.id,
          reason,
          correlationId,
          afterMetadata: {
            targetBoothId: booth.id,
            state: "PENDING",
            coolingOffEndsAt,
          },
        },
        transaction,
      ),
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.booth.deletion_pending",
          targetType: "BOOTH",
          targetId: booth.id,
          reason,
          correlationId,
          beforeMetadata: {
            state: booth.serviceState,
            serviceVersion: booth.serviceVersion,
          },
          afterMetadata: {
            state: "DELETION_PENDING",
            serviceVersion: booth.serviceVersion + 1,
          },
        },
        transaction,
      ),
    ]);
    return {
      status: "PENDING" as const,
      requestId: request.id,
      coolingOffEndsAt,
      serviceVersion: booth.serviceVersion + 1,
    };
  });
}

function recordValue(value: Prisma.JsonValue | null, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, Prisma.JsonValue>)[key];
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? (entry as Record<string, Prisma.JsonValue>)
    : null;
}

function parseUserSnapshot(value: Prisma.JsonValue | null) {
  const priorState = recordValue(value, "priorState");
  if (!priorState) throw new PlatformLifecycleError("INVALID_SNAPSHOT");
  const banned = priorState.banned;
  const banReason = priorState.banReason;
  const banExpires = priorState.banExpires;
  if (
    !(typeof banned === "boolean" || banned === null || banned === undefined) ||
    !(typeof banReason === "string" || banReason === null) ||
    !(typeof banExpires === "string" || banExpires === null)
  ) {
    throw new PlatformLifecycleError("INVALID_SNAPSHOT");
  }
  const parsedExpiry = banExpires ? new Date(banExpires) : null;
  if (parsedExpiry && !Number.isFinite(parsedExpiry.getTime())) {
    throw new PlatformLifecycleError("INVALID_SNAPSHOT");
  }
  return { banned: banned ?? false, banReason, banExpires: parsedExpiry };
}

function parseBoothSnapshot(value: Prisma.JsonValue | null) {
  const priorState = recordValue(value, "priorState");
  if (!priorState) throw new PlatformLifecycleError("INVALID_SNAPSHOT");
  const serviceState = priorState.serviceState;
  const serviceReason = priorState.serviceReason;
  if (
    (serviceState !== "ACTIVE" && serviceState !== "SUSPENDED") ||
    !(typeof serviceReason === "string" || serviceReason === null)
  ) {
    throw new PlatformLifecycleError("INVALID_SNAPSHOT");
  }
  return {
    serviceState: serviceState as "ACTIVE" | "SUSPENDED",
    serviceReason,
  };
}

export async function cancelPlatformDeletion(
  input: LifecycleActor & DeletionTarget & { reason: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.request",
      now,
    });
    const request = await transaction.platformDeletionRequest.findFirst({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        state: { in: [...cancellableDeletionStates] },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });
    if (!request) throw new PlatformLifecycleError("STATE_CONFLICT");
    if (
      request.lastErrorCode === "ORACLE_DELETE_FAILED" ||
      request.lastErrorCode === "ORACLE_NOT_CONFIGURED" ||
      request.lastErrorCode === "TARGET_CHANGED"
    ) {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    const correlationId = randomUUID();

    if (input.targetType === "USER") {
      const snapshot = parseUserSnapshot(request.blockers);
      const target = await transaction.user.findUnique({
        where: { id: input.targetId },
        select: { id: true },
      });
      if (!target) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
      await transaction.user.update({
        where: { id: input.targetId },
        data: snapshot,
      });
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: "CANCELLED",
          cancelledByUserId: input.actorUserId,
          cancelledAt: now,
          lastErrorCode: null,
        },
      });
      await Promise.all([
        recordPlatformAudit(
          {
            actorUserId: input.actorUserId,
            action: "platform.deletion.cancelled",
            targetType: "DELETION_REQUEST",
            targetId: request.id,
            reason,
            correlationId,
            beforeMetadata: { state: request.state },
            afterMetadata: { state: "CANCELLED" },
          },
          transaction,
        ),
        recordPlatformAudit(
          {
            actorUserId: input.actorUserId,
            action: "platform.user.deletion_cancelled",
            targetType: "USER",
            targetId: input.targetId,
            reason,
            correlationId,
            beforeMetadata: { state: "DELETION_PENDING" },
            afterMetadata: {
              state: currentlySuspended(snapshot, now) ? "SUSPENDED" : "ACTIVE",
            },
          },
          transaction,
        ),
      ]);
      return { status: "CANCELLED" as const };
    }

    const snapshot = parseBoothSnapshot(request.blockers);
    const booth = await transaction.booth.findUnique({
      where: { id: input.targetId },
      select: { id: true, serviceState: true, serviceVersion: true },
    });
    if (!booth) throw new PlatformLifecycleError("TARGET_NOT_FOUND");
    if (booth.serviceState !== "DELETION_PENDING") {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    if (
      input.expectedVersion === undefined ||
      booth.serviceVersion !== input.expectedVersion
    ) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    const updated = await transaction.booth.updateMany({
      where: {
        id: booth.id,
        serviceState: "DELETION_PENDING",
        serviceVersion: input.expectedVersion,
      },
      data: {
        serviceState: snapshot.serviceState,
        serviceReason: snapshot.serviceReason,
        serviceStateChangedByUserId: input.actorUserId,
        serviceStateChangedAt: now,
        serviceVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    await transaction.platformDeletionRequest.update({
      where: { id: request.id },
      data: {
        state: "CANCELLED",
        cancelledByUserId: input.actorUserId,
        cancelledAt: now,
        lastErrorCode: null,
      },
    });
    await Promise.all([
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.deletion.cancelled",
          targetType: "DELETION_REQUEST",
          targetId: request.id,
          reason,
          correlationId,
          beforeMetadata: { state: request.state },
          afterMetadata: { state: "CANCELLED" },
        },
        transaction,
      ),
      recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.booth.deletion_cancelled",
          targetType: "BOOTH",
          targetId: booth.id,
          reason,
          correlationId,
          beforeMetadata: {
            state: "DELETION_PENDING",
            serviceVersion: booth.serviceVersion,
          },
          afterMetadata: {
            state: snapshot.serviceState,
            serviceVersion: booth.serviceVersion + 1,
          },
        },
        transaction,
      ),
    ]);
    return {
      status: "CANCELLED" as const,
      serviceVersion: booth.serviceVersion + 1,
    };
  });
}

function hasUserDeletionBlockers(blockers: {
  ownedBooths: number;
  retainedReferences: number;
}) {
  return blockers.ownedBooths > 0 || blockers.retainedReferences > 0;
}

function hasBoothDeletionBlockers(blockers: {
  retainedOrderReferences: number;
  invalidFaceboothDocuments: number;
}) {
  return (
    blockers.retainedOrderReferences > 0 ||
    blockers.invalidFaceboothDocuments > 0
  );
}

function mergeDeletionSnapshot(
  current: Prisma.JsonValue | null,
  extra: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, Prisma.JsonValue>)
      : {};
  return { ...base, ...extra } as Prisma.InputJsonValue;
}

export async function finalizePlatformUserDeletion(
  input: LifecycleActor & {
    targetUserId: string;
    confirmation: string;
    reason: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.finalize",
      now,
      recentStepUp: true,
    });
    const request = await transaction.platformDeletionRequest.findFirst({
      where: {
        targetType: "USER",
        targetId: input.targetUserId,
        state: { in: ["PENDING", "BLOCKED"] },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });
    if (!request) throw new PlatformLifecycleError("STATE_CONFLICT");
    if (request.coolingOffEndsAt.getTime() > now.getTime()) {
      throw new PlatformLifecycleError("COOLING_OFF_ACTIVE");
    }
    const { user, blockers } = await readUserDeletionBlockers(
      transaction,
      input.targetUserId,
    );
    if (input.confirmation !== user.email) {
      throw new PlatformLifecycleError("CONFIRMATION_MISMATCH");
    }
    try {
      await assertPlatformUserDestructiveActionAllowed(transaction, {
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        action: "FINALIZE_DELETION",
      });
    } catch (error) {
      mapSafetyError(error);
    }
    if (hasUserDeletionBlockers(blockers)) {
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: "BLOCKED",
          blockers: mergeDeletionSnapshot(request.blockers, {
            lastPreview: blockers,
          }),
          lastErrorCode: "RETAINED_REFERENCES",
        },
      });
      await recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.deletion.blocked",
          targetType: "DELETION_REQUEST",
          targetId: request.id,
          reason,
          beforeMetadata: { state: request.state },
          afterMetadata: { state: "BLOCKED", ...blockers },
        },
        transaction,
      );
      return { status: "BLOCKED" as const, blockers };
    }

    await transaction.platformDeletionRequest.update({
      where: { id: request.id },
      data: {
        state: "COMPLETED",
        finalizedByUserId: input.actorUserId,
        finalizedAt: now,
        lastErrorCode: null,
      },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "platform.deletion.completed",
        targetType: "DELETION_REQUEST",
        targetId: request.id,
        reason,
        beforeMetadata: {
          state: request.state,
          targetUserId: input.targetUserId,
        },
        afterMetadata: { state: "COMPLETED", targetUserId: input.targetUserId },
      },
      transaction,
    );
    await transaction.user.delete({ where: { id: input.targetUserId } });
    return { status: "COMPLETED" as const };
  });
}

export async function finalizePlatformBoothDeletion(
  input: LifecycleActor & {
    boothId: string;
    expectedVersion: number;
    confirmation: string;
    reason: string;
    now?: Date;
    deleteObjects: PlatformObjectDeleter;
  },
) {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  const preparation = await withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.finalize",
      now,
      recentStepUp: true,
    });
    const request = await transaction.platformDeletionRequest.findFirst({
      where: {
        targetType: "BOOTH",
        targetId: input.boothId,
        state: { in: [...openDeletionStates] },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });
    if (!request) throw new PlatformLifecycleError("STATE_CONFLICT");
    if (request.coolingOffEndsAt.getTime() > now.getTime()) {
      throw new PlatformLifecycleError("COOLING_OFF_ACTIVE");
    }
    const { booth, blockers, objectKeys } = await readBoothDeletionAssets(
      transaction,
      input.boothId,
    );
    if (booth.serviceState !== "DELETION_PENDING") {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    if (booth.serviceVersion !== input.expectedVersion) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    if (input.confirmation !== booth.slug) {
      throw new PlatformLifecycleError("CONFIRMATION_MISMATCH");
    }
    if (hasBoothDeletionBlockers(blockers)) {
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: "BLOCKED",
          blockers: mergeDeletionSnapshot(request.blockers, {
            lastPreview: blockers,
          }),
          lastErrorCode: "RETAINED_REFERENCES",
        },
      });
      await recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.deletion.blocked",
          targetType: "DELETION_REQUEST",
          targetId: request.id,
          reason,
          beforeMetadata: { state: request.state },
          afterMetadata: { state: "BLOCKED", ...blockers },
        },
        transaction,
      );
      return { status: "BLOCKED" as const, blockers };
    }
    await transaction.platformDeletionRequest.update({
      where: { id: request.id },
      data: { state: "FINALIZING", lastErrorCode: null },
    });
    await transaction.storageAsset.updateMany({
      where: {
        boothId: input.boothId,
        objectKey: { in: [...objectKeys] },
        state: { not: "DELETED" },
      },
      data: {
        state: "DELETION_PENDING",
        deletionRequestedAt: now,
        deletionAttempts: { increment: 1 },
        lastDeletionErrorCode: null,
      },
    });
    return {
      status: "FINALIZING" as const,
      requestId: request.id,
      objectKeys: [...objectKeys],
      blockerPreview: blockers,
    };
  });
  if (preparation.status === "BLOCKED") return preparation;

  const providerResult = await input.deleteObjects(preparation.objectKeys);
  if (providerResult.failedObjectKeys.length) {
    await withSerializableRetry(async (transaction) => {
      await requireLifecycleAccess(transaction, {
        ...input,
        permission: "deletion.finalize",
        now: new Date(),
        recentStepUp: true,
      });
      await transaction.storageAsset.updateMany({
        where: {
          boothId: input.boothId,
          objectKey: { in: providerResult.deletedObjectKeys },
        },
        data: {
          state: "DELETED",
          deletedAt: new Date(),
          lastDeletionErrorCode: null,
        },
      });
      await transaction.storageAsset.updateMany({
        where: {
          boothId: input.boothId,
          objectKey: { in: providerResult.failedObjectKeys },
        },
        data: {
          state: "DELETION_PENDING",
          lastDeletionErrorCode:
            providerResult.safeErrorCode ?? "ORACLE_DELETE_FAILED",
        },
      });
      const request = await transaction.platformDeletionRequest.findUnique({
        where: { id: preparation.requestId },
      });
      if (!request || request.state !== "FINALIZING") {
        throw new PlatformLifecycleError("STATE_CONFLICT");
      }
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: "BLOCKED",
          blockers: mergeDeletionSnapshot(request.blockers, {
            lastPreview: preparation.blockerPreview,
            providerFailureCount: providerResult.failedObjectKeys.length,
          }),
          lastErrorCode: providerResult.safeErrorCode ?? "ORACLE_DELETE_FAILED",
        },
      });
      await recordPlatformAudit(
        {
          actorUserId: input.actorUserId,
          action: "platform.deletion.provider_blocked",
          targetType: "DELETION_REQUEST",
          targetId: request.id,
          reason,
          beforeMetadata: { state: "FINALIZING" },
          afterMetadata: {
            state: "BLOCKED",
            failedObjectCount: providerResult.failedObjectKeys.length,
            deletedObjectCount: providerResult.deletedObjectKeys.length,
          },
        },
        transaction,
      );
    });
    return {
      status: "PROVIDER_BLOCKED" as const,
      safeErrorCode: providerResult.safeErrorCode ?? "ORACLE_DELETE_FAILED",
    };
  }

  return withSerializableRetry(async (transaction) => {
    await requireLifecycleAccess(transaction, {
      ...input,
      permission: "deletion.finalize",
      now: new Date(),
      recentStepUp: true,
    });
    const request = await transaction.platformDeletionRequest.findUnique({
      where: { id: preparation.requestId },
    });
    if (!request || request.state !== "FINALIZING") {
      throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    const current = await readBoothDeletionAssets(transaction, input.boothId);
    if (
      current.booth.serviceState !== "DELETION_PENDING" ||
      current.booth.serviceVersion !== input.expectedVersion
    ) {
      throw new PlatformLifecycleError("STALE_TARGET_VERSION");
    }
    if (hasBoothDeletionBlockers(current.blockers)) {
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: {
          state: "BLOCKED",
          blockers: mergeDeletionSnapshot(request.blockers, {
            lastPreview: current.blockers,
          }),
          lastErrorCode: "RETAINED_REFERENCES",
        },
      });
      return { status: "BLOCKED" as const, blockers: current.blockers };
    }
    const originalKeys = new Set(preparation.objectKeys);
    if (
      [...current.objectKeys].some((objectKey) => !originalKeys.has(objectKey))
    ) {
      await transaction.platformDeletionRequest.update({
        where: { id: request.id },
        data: { state: "BLOCKED", lastErrorCode: "TARGET_CHANGED" },
      });
      return {
        status: "PROVIDER_BLOCKED" as const,
        safeErrorCode: "TARGET_CHANGED" as const,
      };
    }

    await transaction.platformDeletionRequest.update({
      where: { id: request.id },
      data: {
        state: "COMPLETED",
        finalizedByUserId: input.actorUserId,
        finalizedAt: new Date(),
        lastErrorCode: null,
      },
    });
    await recordPlatformAudit(
      {
        actorUserId: input.actorUserId,
        action: "platform.deletion.completed",
        targetType: "DELETION_REQUEST",
        targetId: request.id,
        reason,
        beforeMetadata: { state: "FINALIZING", targetBoothId: input.boothId },
        afterMetadata: {
          state: "COMPLETED",
          targetBoothId: input.boothId,
          deletedObjectCount: preparation.objectKeys.length,
        },
      },
      transaction,
    );
    await transaction.booth.delete({ where: { id: input.boothId } });
    return { status: "COMPLETED" as const };
  });
}
