import type { Metadata } from "next";
import {
  PageHeading,
  adminStyles as admin,
} from "@/components/admin/admin-shell";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import {
  InviteMemberForm,
  MemberAccessForm,
  RemoveMemberForm,
  RevokeInvitationForm,
} from "./team-controls";
import styles from "./team.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).team;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const { membership: viewerMembership } = await requireBoothSection(
    boothId,
    "team",
  );
  const isOwner = viewerMembership.role === "OWNER";
  const [members, invitations, locale] = await Promise.all([
    db.boothMembership.findMany({
      where: { boothId },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.teamInvitation.findMany({
      where: { boothId, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.team;
  const common = workspaceStrings.common;
  const dateLocale = locale === "vi" ? "vi-VN" : "en-GB";
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  const usedSlots = activeMembers.length + invitations.length;
  const remainingSlots = Math.max(0, 10 - usedSlots);

  return (
    <div className={styles.teamPage}>
      <PageHeading
        eyebrow={strings.eyebrow}
        title={strings.title}
        description={strings.description}
        actions={
          <span className={admin.pill}>
            {strings.activePending(activeMembers.length, invitations.length)}
          </span>
        }
      />

      {!isOwner ? (
        <div className={styles.readOnlyNotice} role="status">
          <strong>{strings.readOnlyTitle}</strong>
          <span>{strings.readOnlyBody}</span>
        </div>
      ) : null}

      <div className={styles.teamGrid}>
        <aside className={styles.inviteCard}>
          {isOwner ? (
            <InviteMemberForm
              boothId={boothId}
              locale={locale}
              remainingSlots={remainingSlots}
            />
          ) : (
            <div className={styles.readOnlyCard}>
              <p className={styles.cardEyebrow}>{strings.ownerControls}</p>
              <h2>{strings.inviteTitle}</h2>
              <p>{strings.ownerOnlyInvite}</p>
            </div>
          )}

          <section
            className={styles.pendingSection}
            aria-labelledby="pending-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.cardEyebrow}>{strings.openLinks}</p>
                <h2 id="pending-title">{strings.pendingInvitations}</h2>
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
                        {strings.roleExpires(
                          common.roleLabels[invitation.role],
                          invitation.expiresAt.toLocaleDateString(dateLocale),
                        )}
                      </span>
                    </div>
                    {isOwner ? (
                      <RevokeInvitationForm
                        boothId={boothId}
                        invitationId={invitation.id}
                        locale={locale}
                      />
                    ) : (
                      <span className={styles.statusBadge}>
                        {common.pending}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyCopy}>{strings.noInvitations}</p>
            )}
          </section>
        </aside>

        <section className={styles.membersCard} aria-labelledby="members-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.cardEyebrow}>{strings.peopleWithAccess}</p>
              <h2 id="members-title">{strings.members}</h2>
            </div>
            <span className={styles.countBadge}>{members.length}</span>
          </div>
          <p className={styles.cardIntro}>{strings.membersIntro}</p>

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
                      <span className={styles.statusBadge}>{common.owner}</span>
                      <span className={styles.statusBadge}>
                        {common.alwaysActive}
                      </span>
                    </div>
                  ) : isOwner ? (
                    <div className={styles.memberActions}>
                      <MemberAccessForm
                        boothId={boothId}
                        membershipId={member.id}
                        role={member.role}
                        status={member.status}
                        memberName={memberName}
                        locale={locale}
                      />
                      <RemoveMemberForm
                        boothId={boothId}
                        membershipId={member.id}
                        memberName={memberName}
                        locale={locale}
                      />
                    </div>
                  ) : (
                    <div className={styles.memberBadges}>
                      <span className={styles.statusBadge}>
                        {common.roleLabels[member.role]}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${member.status === "DISABLED" ? styles.disabledBadge : ""}`}
                      >
                        {member.status === "ACTIVE"
                          ? common.active
                          : common.disabled}
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
