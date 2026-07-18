import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import { inviteTeamMemberAction, updateTeamMemberAction } from "../actions";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const { boothId } = await params;
  const messages = await searchParams;
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

  return (
    <>
      <PageHeading
        eyebrow="Access management"
        title="Team"
        description="Invite collaborators and control what they can do in this booth."
      />

      {messages.invited ? (
        <p className={styles.notice}>
          Invitation recorded. Email delivery is not configured yet, so no
          delivery claim is made.
        </p>
      ) : null}
      {!isOwner ? (
        <p className={styles.notice}>
          Only the booth owner can invite people or change team access.
        </p>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Team access</h2>
            <p>
              Owners control roles; every server mutation verifies booth
              membership.
            </p>
          </div>
        </div>

        <div className={styles.metrics}>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon} aria-hidden="true">
              ♧
            </span>
            <span>
              <strong>{activeMembers.length}</strong>
              <small>Active members</small>
            </span>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon} aria-hidden="true">
              ✉
            </span>
            <span>
              <strong>{invitations.length}</strong>
              <small>Pending invites</small>
            </span>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon} aria-hidden="true">
              ◇
            </span>
            <span>
              <strong>{activeMembers.length}/10</strong>
              <small>Team places used</small>
            </span>
          </article>
        </div>

        <div className={styles.splitLayout}>
          <form
            action={inviteTeamMemberAction}
            className={`${styles.softPanel} ${styles.stack}`}
          >
            <input type="hidden" name="boothId" value={boothId} />
            <div>
              <h3>Invite a teammate</h3>
              <p>Choose what they can do. Roles can be changed later.</p>
            </div>
            <label className={styles.field}>
              Email
              <input
                name="email"
                type="email"
                placeholder="staff@example.com"
                required
                disabled={!isOwner}
              />
            </label>
            <label className={styles.field}>
              Role
              <select name="role" defaultValue="STAFF" disabled={!isOwner}>
                <option value="STAFF">Staff · process orders</option>
                <option value="ADMIN">
                  Admin · catalogue, design, and orders
                </option>
              </select>
            </label>
            {isOwner ? (
              <SubmitButton
                className={styles.buttonPrimary}
                pendingLabel="Recording invitation…"
              >
                Record invitation
              </SubmitButton>
            ) : null}
          </form>

          <section className={styles.softPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Members</h3>
                <p>{members.length} people with booth access</p>
              </div>
            </div>
            <ul className={styles.memberList}>
              {members.map((member) => (
                <li className={styles.memberCard} key={member.id}>
                  <div>
                    <strong>{member.user.name}</strong>
                    <small>{member.user.email}</small>
                  </div>
                  {member.role === "OWNER" ? (
                    <div className={styles.inlineActions}>
                      <span className={styles.statusBadge} data-status="ACTIVE">
                        owner
                      </span>
                      <span className={styles.statusBadge} data-status="ACTIVE">
                        enabled
                      </span>
                    </div>
                  ) : (
                    <form
                      action={updateTeamMemberAction}
                      className={styles.inlineActions}
                    >
                      <input type="hidden" name="boothId" value={boothId} />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={member.id}
                      />
                      <select
                        className={styles.searchInput}
                        name="role"
                        defaultValue={member.role}
                        disabled={!isOwner}
                        aria-label={`Role for ${member.user.name}`}
                      >
                        <option value="STAFF">staff</option>
                        <option value="ADMIN">admin</option>
                      </select>
                      <select
                        className={styles.searchInput}
                        name="status"
                        defaultValue={member.status}
                        disabled={!isOwner}
                        aria-label={`Status for ${member.user.name}`}
                      >
                        <option value="ACTIVE">enabled</option>
                        <option value="DISABLED">disabled</option>
                      </select>
                      {isOwner ? (
                        <SubmitButton
                          className={styles.button}
                          pendingLabel="Saving…"
                        >
                          Save
                        </SubmitButton>
                      ) : null}
                    </form>
                  )}
                </li>
              ))}
            </ul>

            {invitations.length ? (
              <div className={styles.stack} style={{ marginTop: 20 }}>
                <h3>Pending invitations</h3>
                {invitations.map((invitation) => (
                  <div className={styles.listItem} key={invitation.id}>
                    <span>
                      <strong>{invitation.email}</strong>
                      <small>
                        {invitation.role.toLocaleLowerCase()} · expires{" "}
                        {invitation.expiresAt.toLocaleDateString("en-GB")}
                      </small>
                    </span>
                    <span className={styles.statusBadge} data-status="PENDING">
                      pending
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </>
  );
}
