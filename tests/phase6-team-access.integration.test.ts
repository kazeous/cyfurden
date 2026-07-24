import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  acceptTeamInvitation,
  createTeamInvitation,
  removeTeamMember,
  revokeTeamInvitation,
  TEAM_ACCESS_LIMIT,
  TEAM_INVITATION_TTL_MS,
  updateTeamMemberAccess,
} from "../lib/team-access";

const enabled = process.env.CYFURDEN_PHASE6_INTEGRATION === "1";

test(
  "Phase 6 enforces invitation, lifecycle, owner, audit, and capacity rules",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase6-owner-${suffix}`;
    const staffId = `phase6-staff-${suffix}`;
    const adminId = `phase6-admin-${suffix}`;
    const ownerEmail = `phase6-owner-${suffix}@example.com`;
    const staffEmail = `phase6-staff-${suffix}@example.com`;
    const adminEmail = `phase6-admin-${suffix}@example.com`;
    let boothId: string | null = null;

    try {
      await db.user.createMany({
        data: [
          {
            id: ownerId,
            name: "Phase Six Owner",
            email: ownerEmail,
            emailVerified: true,
          },
          {
            id: staffId,
            name: "Phase Six Staff",
            email: staffEmail,
            emailVerified: true,
          },
          {
            id: adminId,
            name: "Phase Six Admin",
            email: adminEmail,
            emailVerified: true,
          },
        ],
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase6-${suffix.slice(0, 16)}`,
          name: "Phase Six Booth",
          ownerId,
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
        include: { memberships: true },
      });
      boothId = booth.id;
      const ownerMembership = booth.memberships[0];
      assert.ok(ownerMembership);

      await assert.rejects(() =>
        db.teamInvitation.create({
          data: {
            boothId: booth.id,
            email: `phase6-owner-role-${suffix}@example.com`,
            role: "OWNER",
            tokenHash: `phase6-owner-role-${suffix}`,
            invitedById: ownerId,
            expiresAt: new Date(Date.now() + TEAM_INVITATION_TTL_MS),
          },
        }),
      );
      await assert.rejects(() =>
        db.boothMembership.create({
          data: {
            boothId: booth.id,
            userId: staffId,
            role: "OWNER",
            status: "ACTIVE",
          },
        }),
      );

      const invitedAt = new Date();
      const staffInvite = await createTeamInvitation({
        boothId,
        email: staffEmail.toUpperCase(),
        role: "STAFF",
        actorUserId: ownerId,
        now: invitedAt,
      });
      assert.equal(staffInvite.kind, "created");
      assert.equal(
        staffInvite.kind === "created" &&
          staffInvite.expiresAt.getTime() - invitedAt.getTime(),
        TEAM_INVITATION_TTL_MS,
      );

      const duplicateInvite = await createTeamInvitation({
        boothId,
        email: staffEmail,
        role: "STAFF",
        actorUserId: ownerId,
      });
      assert.equal(duplicateInvite.kind, "already-invited");
      assert.equal(staffInvite.kind, "created");
      if (staffInvite.kind !== "created") return;

      const wrongAccount = await acceptTeamInvitation({
        token: staffInvite.token,
        userId: adminId,
        userEmail: adminEmail,
      });
      assert.equal(wrongAccount.kind, "email-mismatch");
      assert.equal(
        (
          await db.teamInvitation.findUniqueOrThrow({
            where: { id: staffInvite.invitationId },
          })
        ).status,
        "PENDING",
      );

      const acceptedStaff = await acceptTeamInvitation({
        token: staffInvite.token,
        userId: staffId,
        userEmail: staffEmail,
      });
      assert.equal(acceptedStaff.kind, "accepted");
      const staffMembership = await db.boothMembership.findUniqueOrThrow({
        where: { boothId_userId: { boothId, userId: staffId } },
      });
      assert.equal(staffMembership.role, "STAFF");
      assert.equal(staffMembership.status, "ACTIVE");
      assert.equal(
        (
          await acceptTeamInvitation({
            token: staffInvite.token,
            userId: staffId,
            userEmail: staffEmail,
          })
        ).kind,
        "inactive",
      );
      assert.equal(
        (
          await createTeamInvitation({
            boothId,
            email: staffEmail,
            role: "ADMIN",
            actorUserId: ownerId,
          })
        ).kind,
        "already-member",
      );

      const adminInvite = await createTeamInvitation({
        boothId,
        email: adminEmail,
        role: "ADMIN",
        actorUserId: ownerId,
      });
      assert.equal(adminInvite.kind, "created");
      if (adminInvite.kind !== "created") return;
      assert.equal(
        (
          await acceptTeamInvitation({
            token: adminInvite.token,
            userId: adminId,
            userEmail: adminEmail,
          })
        ).kind,
        "accepted",
      );
      assert.equal(
        (
          await db.boothMembership.findUniqueOrThrow({
            where: { boothId_userId: { boothId, userId: adminId } },
          })
        ).role,
        "ADMIN",
      );

      await db.boothMembership.update({
        where: { id: ownerMembership.id },
        data: { role: "STAFF", status: "DISABLED" },
      });
      assert.equal(
        (
          await updateTeamMemberAccess({
            boothId,
            membershipId: ownerMembership.id,
            actorUserId: ownerId,
            role: "STAFF",
            status: "DISABLED",
          })
        ).kind,
        "owner-protected",
      );
      assert.equal(
        (
          await removeTeamMember({
            boothId,
            membershipId: ownerMembership.id,
            actorUserId: ownerId,
          })
        ).kind,
        "owner-protected",
      );
      assert.deepEqual(
        await db.boothMembership.findUniqueOrThrow({
          where: { id: ownerMembership.id },
          select: { role: true, status: true },
        }),
        { role: "STAFF", status: "DISABLED" },
      );
      await db.boothMembership.update({
        where: { id: ownerMembership.id },
        data: { role: "OWNER", status: "ACTIVE" },
      });

      assert.equal(
        (
          await updateTeamMemberAccess({
            boothId,
            membershipId: staffMembership.id,
            actorUserId: ownerId,
            role: "ADMIN",
            status: "DISABLED",
          })
        ).kind,
        "updated",
      );
      assert.equal(
        await db.boothMembership.count({
          where: { id: staffMembership.id, status: "ACTIVE" },
        }),
        0,
      );
      assert.equal(
        (
          await updateTeamMemberAccess({
            boothId,
            membershipId: staffMembership.id,
            actorUserId: ownerId,
            role: "STAFF",
            status: "ACTIVE",
          })
        ).kind,
        "updated",
      );
      assert.equal(
        (
          await removeTeamMember({
            boothId,
            membershipId: staffMembership.id,
            actorUserId: ownerId,
          })
        ).kind,
        "removed",
      );
      const disabledStaffMembership = await db.boothMembership.create({
        data: {
          boothId,
          userId: staffId,
          role: "STAFF",
          status: "DISABLED",
        },
      });

      const revokedInvite = await createTeamInvitation({
        boothId,
        email: `phase6-revoked-${suffix}@example.com`,
        role: "STAFF",
        actorUserId: ownerId,
      });
      assert.equal(revokedInvite.kind, "created");
      if (revokedInvite.kind !== "created") return;
      assert.equal(
        await revokeTeamInvitation({
          boothId,
          invitationId: revokedInvite.invitationId,
          actorUserId: ownerId,
        }),
        true,
      );
      assert.equal(
        (
          await acceptTeamInvitation({
            token: revokedInvite.token,
            userId: `phase6-revoked-user-${suffix}`,
            userEmail: `phase6-revoked-${suffix}@example.com`,
          })
        ).kind,
        "inactive",
      );

      const expiredInvite = await createTeamInvitation({
        boothId,
        email: `phase6-expired-${suffix}@example.com`,
        role: "STAFF",
        actorUserId: ownerId,
        now: new Date(Date.now() - TEAM_INVITATION_TTL_MS - 60_000),
      });
      assert.equal(expiredInvite.kind, "created");
      if (expiredInvite.kind !== "created") return;
      assert.equal(
        (
          await acceptTeamInvitation({
            token: expiredInvite.token,
            userId: `phase6-expired-user-${suffix}`,
            userEmail: `phase6-expired-${suffix}@example.com`,
          })
        ).kind,
        "expired",
      );
      assert.equal(
        (
          await db.teamInvitation.findUniqueOrThrow({
            where: { id: expiredInvite.invitationId },
          })
        ).status,
        "EXPIRED",
      );

      const usedBeforeCapacity = [];
      for (let index = 0; index < TEAM_ACCESS_LIMIT - 3; index += 1) {
        usedBeforeCapacity.push(
          await createTeamInvitation({
            boothId,
            email: `phase6-cap-${index}-${suffix}@example.com`,
            role: "STAFF",
            actorUserId: ownerId,
          }),
        );
      }
      assert.ok(
        usedBeforeCapacity.every((result) => result.kind === "created"),
      );

      const boundaryResults = await Promise.all([
        createTeamInvitation({
          boothId,
          email: `phase6-boundary-a-${suffix}@example.com`,
          role: "STAFF",
          actorUserId: ownerId,
        }),
        createTeamInvitation({
          boothId,
          email: `phase6-boundary-b-${suffix}@example.com`,
          role: "STAFF",
          actorUserId: ownerId,
        }),
      ]);
      assert.deepEqual(boundaryResults.map((result) => result.kind).sort(), [
        "capacity",
        "created",
      ]);
      const activeMemberCount = await db.boothMembership.count({
        where: { boothId, status: "ACTIVE" },
      });
      const pendingInvitationCount = await db.teamInvitation.count({
        where: {
          boothId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });
      assert.equal(
        activeMemberCount + pendingInvitationCount,
        TEAM_ACCESS_LIMIT,
      );
      assert.equal(
        (
          await updateTeamMemberAccess({
            boothId,
            membershipId: disabledStaffMembership.id,
            actorUserId: ownerId,
            role: "STAFF",
            status: "ACTIVE",
          })
        ).kind,
        "capacity",
      );
      assert.equal(
        (
          await db.boothMembership.findUniqueOrThrow({
            where: { id: disabledStaffMembership.id },
          })
        ).status,
        "DISABLED",
      );

      const actions = (
        await db.auditLog.findMany({
          where: { boothId },
          orderBy: { createdAt: "asc" },
          select: { action: true },
        })
      ).map(({ action }) => action);
      assert.ok(actions.includes("team.invitation_accepted"));
      assert.ok(actions.includes("team.invitation_revoked"));
      assert.ok(actions.includes("team.member_updated"));
      assert.ok(actions.includes("team.member_removed"));
    } finally {
      if (boothId) {
        await db.booth.deleteMany({ where: { id: boothId } });
      }
      await db.user.deleteMany({
        where: { id: { in: [ownerId, staffId, adminId] } },
      });
    }
  },
);
