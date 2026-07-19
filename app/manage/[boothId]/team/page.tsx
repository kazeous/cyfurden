import type { Metadata } from "next";
import {
  PageHeading,
  adminStyles as admin,
} from "@/components/admin/admin-shell";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  InviteMemberForm,
  MemberAccessForm,
  RevokeInvitationForm,
} from "./team-controls";
import styles from "./team.module.css";

export const metadata: Metadata = {
  title: "Team access",
  robots: { index: false, follow: false },
};

export default async function TeamPage({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const { membership: viewerMembership } = await requireBoothMember(boothId);
  const isOwner = viewerMembership.role === "OWNER";
  const [members, invitations] = await Promise.all([
    db.boothMembership.findMany({
      where: { boothId },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.teamInvitation.findMany({
      where: { boothId, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  const usedSlots = activeMembers.length + invitations.length;
  const remainingSlots = Math.max(0, 10 - usedSlots);

  return (
    <div className={styles.teamPage}>
      <PageHeading
        eyebrow="Access management"
        title="Team"
        description="Keep booth access clear, intentional, and easy to hand off."
        actions={
          <span className={admin.pill}>
            {activeMembers.length} active / {invitations.length} pending
          </span>
        }
      />

      {!isOwner ? (
        <div className={styles.readOnlyNotice} role="status">
          <strong>Read-only access</strong>
          <span>
            You can see the people in this booth, but only the owner can invite
            teammates or change access.
          </span>
        </div>
      ) : null}

      <div className={styles.teamGrid}>
        <aside className={styles.inviteCard}>
          {isOwner ? (
            <InviteMemberForm
              boothId={boothId}
              remainingSlots={remainingSlots}
            />
          ) : (
            <div className={styles.readOnlyCard}>
              <p className={styles.cardEyebrow}>Owner controls</p>
              <h2>Invite a teammate</h2>
              <p>
                Ask the booth owner to create an invitation link. You cannot
                change access from a staff or admin account.
              </p>
            </div>
          )}

          <section
            className={styles.pendingSection}
            aria-labelledby="pending-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.cardEyebrow}>Open links</p>
                <h2 id="pending-title">Pending invitations</h2>
              </div>
              <span className={styles.countBadge}>{invitations.length}</span>
            </div>
            {invitations.length ? (
              <ul className={styles.invitationList}>
                {invitations.map((invitation) => (
                  <li className={styles.invitationItem} key={invitation.id}>
                    <div className={styles.itemIdentity}>
                      <strong>{invitation.email}</strong>
                      <span>
                        {invitation.role === "ADMIN" ? "Admin" : "Staff"} ·
                        expires{" "}
                        {invitation.expiresAt.toLocaleDateString("en-GB")}
                      </span>
                    </div>
                    {isOwner ? (
                      <RevokeInvitationForm
                        boothId={boothId}
                        invitationId={invitation.id}
                      />
                    ) : (
                      <span className={styles.statusBadge}>Pending</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyCopy}>
                No open invitations. New links appear here until they are used,
                revoked, or expire.
              </p>
            )}
          </section>
        </aside>

        <section className={styles.membersCard} aria-labelledby="members-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.cardEyebrow}>People with access</p>
              <h2 id="members-title">Members</h2>
            </div>
            <span className={styles.countBadge}>{members.length}</span>
          </div>
          <p className={styles.cardIntro}>
            Owners cannot be removed. Disabled members keep their history but
            cannot open this booth until re-enabled.
          </p>

          <ul className={styles.memberList}>
            {members.map((member) => {
              const memberName = member.user.name || member.user.email;
              return (
                <li className={styles.memberItem} key={member.id}>
                  <div className={styles.memberIdentity}>
                    <span className={styles.avatar} aria-hidden="true">
                      {memberName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{memberName}</strong>
                      <span>{member.user.email}</span>
                    </div>
                  </div>
                  {member.role === "OWNER" ? (
                    <div className={styles.memberBadges}>
                      <span className={styles.statusBadge}>Owner</span>
                      <span className={styles.statusBadge}>Always active</span>
                    </div>
                  ) : isOwner ? (
                    <MemberAccessForm
                      boothId={boothId}
                      membershipId={member.id}
                      role={member.role}
                      status={member.status}
                      memberName={memberName}
                    />
                  ) : (
                    <div className={styles.memberBadges}>
                      <span className={styles.statusBadge}>
                        {member.role === "ADMIN" ? "Admin" : "Staff"}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${member.status === "DISABLED" ? styles.disabledBadge : ""}`}
                      >
                        {member.status === "ACTIVE" ? "Active" : "Disabled"}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
