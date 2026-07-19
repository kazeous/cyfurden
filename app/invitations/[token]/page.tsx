import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import { InvitationAcceptanceForm } from "./invitation-form";
import styles from "./invitation.module.css";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = /^[a-f0-9]{64}$/i.test(token)
    ? await db.teamInvitation.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
        include: { booth: true },
      })
    : null;

  if (!invitation) {
    return (
      <InvitationShell>
        <p className={styles.eyebrow}>Invitation unavailable</p>
        <h1>This link does not work</h1>
        <p>
          Check that the full invitation link was copied, or ask the booth owner
          to create a new one.
        </p>
        <Link className={styles.secondaryButton} href="/">
          Visit storefront
        </Link>
      </InvitationShell>
    );
  }

  const session = await requireUser(`/invitations/${token}`);
  const expired = invitation.expiresAt <= new Date();
  const emailMatches =
    invitation.email.toLocaleLowerCase() ===
    session.user.email.trim().toLocaleLowerCase();
  const active = invitation.status === "PENDING" && !expired;

  if (!active || !emailMatches) {
    return (
      <InvitationShell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1>
          {!emailMatches
            ? "Use the invited account"
            : expired
              ? "This link has expired"
              : "This invitation is no longer active"}
        </h1>
        <p>
          {!emailMatches
            ? `This invitation was created for ${invitation.email}. Sign out and sign in with that account, then open the link again.`
            : expired
              ? "Ask the booth owner to create a fresh invitation link."
              : "It may already have been accepted or revoked."}
        </p>
        <Link className={styles.secondaryButton} href="/dashboard">
          Go to dashboard
        </Link>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <p className={styles.eyebrow}>You have been invited</p>
      <h1>Join {invitation.booth.name}</h1>
      <p>
        You will join as a{" "}
        {invitation.role === "ADMIN" ? "booth admin" : "staff member"}. Your
        account email matches this invitation.
      </p>
      <InvitationAcceptanceForm
        token={token}
        boothName={invitation.booth.name}
      />
    </InvitationShell>
  );
}

function InvitationShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>Artist booth studio</small>
          </span>
        </Link>
        <section className={styles.content}>{children}</section>
      </div>
    </main>
  );
}
