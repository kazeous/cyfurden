import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { InvitationAcceptanceForm } from "./invitation-form";
import styles from "./invitation.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).invitation;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, locale] = await Promise.all([params, readLocaleCookie()]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.invitation;
  const invitation = /^[a-f0-9]{64}$/i.test(token)
    ? await db.teamInvitation.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
        include: { booth: true },
      })
    : null;

  if (
    !invitation ||
    (invitation.role !== "ADMIN" && invitation.role !== "STAFF")
  ) {
    return (
      <InvitationShell locale={locale}>
        <p className={styles.eyebrow}>{strings.unavailableEyebrow}</p>
        <h1>{strings.unavailableTitle}</h1>
        <p>{strings.unavailableBody}</p>
        <Link className={styles.secondaryButton} href="/">
          {strings.visitStorefront}
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
      <InvitationShell locale={locale}>
        <p className={styles.eyebrow}>{strings.invitationEyebrow}</p>
        <h1>
          {!emailMatches
            ? strings.invitedAccountTitle
            : expired
              ? strings.expiredTitle
              : strings.inactiveTitle}
        </h1>
        <p>
          {!emailMatches
            ? strings.wrongAccountBody(invitation.email)
            : expired
              ? strings.expiredBody
              : strings.inactiveBody}
        </p>
        <Link className={styles.secondaryButton} href="/dashboard">
          {strings.dashboard}
        </Link>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell locale={locale}>
      <p className={styles.eyebrow}>{strings.invitedEyebrow}</p>
      <h1>{strings.joinTitle(invitation.booth.name)}</h1>
      <p>
        {invitation.role === "ADMIN"
          ? strings.joinBodyAdmin
          : strings.joinBodyStaff}
      </p>
      <InvitationAcceptanceForm token={token} locale={locale} />
    </InvitationShell>
  );
}

function InvitationShell({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale);
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>{strings.common.brandSubline}</small>
          </span>
        </Link>
        <section className={styles.content}>{children}</section>
      </div>
    </main>
  );
}
