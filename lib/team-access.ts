import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireBoothServiceAccess } from "@/lib/platform-targets";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export const TEAM_ACCESS_LIMIT = 10;
export const TEAM_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TeamInviteRole = "ADMIN" | "STAFF";
export type TeamMemberStatus = "ACTIVE" | "DISABLED";

const isTeamInviteRole = (role: string): role is TeamInviteRole =>
  role === "ADMIN" || role === "STAFF";

type CreateInvitationResult =
  | {
      kind: "created";
      invitationId: string;
      token: string;
      email: string;
      expiresAt: Date;
    }
  | { kind: "already-member" }
  | { kind: "already-invited" }
  | { kind: "capacity" };

type UpdateMemberResult =
  | { kind: "updated" }
  | { kind: "missing" }
  | { kind: "owner-protected" }
  | { kind: "capacity" };

type RemoveMemberResult =
  | { kind: "removed" }
  | { kind: "missing" }
  | { kind: "owner-protected" };

export type AcceptInvitationResult =
  | { kind: "accepted"; boothId: string }
  | {
      kind:
        | "invalid"
        | "inactive"
        | "expired"
        | "email-mismatch"
        | "owner-protected";
      invitedEmail?: string;
    };

const hasPrismaCode = (error: unknown, code: string) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === code;

async function runSerializable<T>(
  operation: (transaction: TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (hasPrismaCode(error, "P2034") && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("Serializable team transaction exhausted its retries.");
}

async function expireStaleInvitations(
  transaction: TransactionClient,
  boothId: string,
  now: Date,
) {
  await transaction.teamInvitation.updateMany({
    where: { boothId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

export async function createTeamInvitation(input: {
  boothId: string;
  email: string;
  role: TeamInviteRole;
  actorUserId: string;
  now?: Date;
  token?: string;
}): Promise<CreateInvitationResult> {
  const email = input.email.trim().toLocaleLowerCase();
  const now = input.now ?? new Date();
  const token = input.token ?? randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(now.getTime() + TEAM_INVITATION_TTL_MS);

  return runSerializable(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    await expireStaleInvitations(transaction, input.boothId, now);
    const [existingMember, pendingInvite, activeMembers, pendingInvites] =
      await Promise.all([
        transaction.boothMembership.findFirst({
          where: {
            boothId: input.boothId,
            user: { email: { equals: email, mode: "insensitive" } },
          },
          select: { id: true },
        }),
        transaction.teamInvitation.findFirst({
          where: {
            boothId: input.boothId,
            email: { equals: email, mode: "insensitive" },
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: { id: true },
        }),
        transaction.boothMembership.count({
          where: { boothId: input.boothId, status: "ACTIVE" },
        }),
        transaction.teamInvitation.count({
          where: {
            boothId: input.boothId,
            status: "PENDING",
            expiresAt: { gt: now },
          },
        }),
      ]);

    if (existingMember) return { kind: "already-member" };
    if (pendingInvite) return { kind: "already-invited" };
    if (activeMembers + pendingInvites >= TEAM_ACCESS_LIMIT) {
      return { kind: "capacity" };
    }

    const invitation = await transaction.teamInvitation.create({
      data: {
        boothId: input.boothId,
        email,
        role: input.role,
        tokenHash,
        invitedById: input.actorUserId,
        expiresAt,
      },
      select: { id: true },
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "team.invited",
        entityType: "TeamInvitation",
        entityId: invitation.id,
        metadata: { email, role: input.role },
      },
    });

    return {
      kind: "created",
      invitationId: invitation.id,
      token,
      email,
      expiresAt,
    };
  });
}

export async function revokeTeamInvitation(input: {
  boothId: string;
  invitationId: string;
  actorUserId: string;
}) {
  return db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    const revoked = await transaction.teamInvitation.updateMany({
      where: {
        id: input.invitationId,
        boothId: input.boothId,
        status: "PENDING",
      },
      data: { status: "REVOKED" },
    });
    if (!revoked.count) return false;

    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "team.invitation_revoked",
        entityType: "TeamInvitation",
        entityId: input.invitationId,
      },
    });
    return true;
  });
}

export async function updateTeamMemberAccess(input: {
  boothId: string;
  membershipId: string;
  actorUserId: string;
  role: TeamInviteRole;
  status: TeamMemberStatus;
  now?: Date;
}): Promise<UpdateMemberResult> {
  const now = input.now ?? new Date();

  return runSerializable(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    await expireStaleInvitations(transaction, input.boothId, now);
    const membership = await transaction.boothMembership.findFirst({
      where: { id: input.membershipId, boothId: input.boothId },
      include: { booth: { select: { ownerId: true } } },
    });
    if (!membership) return { kind: "missing" };
    if (
      membership.role === "OWNER" ||
      membership.userId === membership.booth.ownerId
    ) {
      return { kind: "owner-protected" };
    }

    if (membership.status !== "ACTIVE" && input.status === "ACTIVE") {
      const [activeMembers, pendingInvites] = await Promise.all([
        transaction.boothMembership.count({
          where: { boothId: input.boothId, status: "ACTIVE" },
        }),
        transaction.teamInvitation.count({
          where: {
            boothId: input.boothId,
            status: "PENDING",
            expiresAt: { gt: now },
          },
        }),
      ]);
      if (activeMembers + pendingInvites >= TEAM_ACCESS_LIMIT) {
        return { kind: "capacity" };
      }
    }

    await transaction.boothMembership.update({
      where: { id: input.membershipId },
      data: { role: input.role, status: input.status },
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "team.member_updated",
        entityType: "BoothMembership",
        entityId: input.membershipId,
        metadata: { role: input.role, status: input.status },
      },
    });
    return { kind: "updated" };
  });
}

export async function removeTeamMember(input: {
  boothId: string;
  membershipId: string;
  actorUserId: string;
}): Promise<RemoveMemberResult> {
  return db.$transaction(async (transaction) => {
    await requireBoothServiceAccess(input.boothId, "MUTATION", transaction);
    const membership = await transaction.boothMembership.findFirst({
      where: { id: input.membershipId, boothId: input.boothId },
      include: { booth: { select: { ownerId: true } } },
    });
    if (!membership) return { kind: "missing" };
    if (
      membership.role === "OWNER" ||
      membership.userId === membership.booth.ownerId
    ) {
      return { kind: "owner-protected" };
    }

    await transaction.boothMembership.delete({
      where: { id: input.membershipId },
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "team.member_removed",
        entityType: "BoothMembership",
        entityId: input.membershipId,
        metadata: { userId: membership.userId, role: membership.role },
      },
    });
    return { kind: "removed" };
  });
}

export async function acceptTeamInvitation(input: {
  token: string;
  userId: string;
  userEmail: string;
  now?: Date;
}): Promise<AcceptInvitationResult> {
  if (!/^[a-f0-9]{64}$/i.test(input.token)) return { kind: "invalid" };

  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const userEmail = input.userEmail.trim().toLocaleLowerCase();
  const now = input.now ?? new Date();

  return runSerializable(async (transaction) => {
    const invitation = await transaction.teamInvitation.findUnique({
      where: { tokenHash },
      include: {
        booth: { select: { ownerId: true, serviceState: true } },
      },
    });
    if (!invitation) return { kind: "invalid" };
    await requireBoothServiceAccess(
      invitation.boothId,
      "MUTATION",
      transaction,
    );
    if (!isTeamInviteRole(invitation.role)) return { kind: "invalid" };
    if (invitation.status !== "PENDING") return { kind: "inactive" };
    if (invitation.expiresAt <= now) {
      await transaction.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return { kind: "expired" };
    }
    if (invitation.email.toLocaleLowerCase() !== userEmail) {
      return { kind: "email-mismatch", invitedEmail: invitation.email };
    }
    if (invitation.booth.ownerId === input.userId) {
      return { kind: "owner-protected" };
    }

    const existingMembership = await transaction.boothMembership.findUnique({
      where: {
        boothId_userId: {
          boothId: invitation.boothId,
          userId: input.userId,
        },
      },
    });
    if (existingMembership?.role === "OWNER") {
      return { kind: "owner-protected" };
    }

    const accepted = await transaction.teamInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedById: input.userId,
      },
    });
    if (!accepted.count) return { kind: "inactive" };

    if (existingMembership) {
      await transaction.boothMembership.update({
        where: { id: existingMembership.id },
        data: { role: invitation.role, status: "ACTIVE" },
      });
    } else {
      await transaction.boothMembership.create({
        data: {
          boothId: invitation.boothId,
          userId: input.userId,
          role: invitation.role,
          status: "ACTIVE",
        },
      });
    }
    await transaction.auditLog.create({
      data: {
        boothId: invitation.boothId,
        actorUserId: input.userId,
        action: "team.invitation_accepted",
        entityType: "TeamInvitation",
        entityId: invitation.id,
        metadata: { role: invitation.role },
      },
    });

    return {
      kind: "accepted",
      boothId: invitation.boothId,
    };
  });
}
