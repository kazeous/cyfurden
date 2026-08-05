"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptTeamInvitationAction } from "@/app/manage/[boothId]/actions";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./invitation.module.css";

export function InvitationAcceptanceForm({
  token,
  locale,
}: {
  token: string;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    acceptTeamInvitationAction,
    {},
  );
  const strings = getWorkspaceStrings(locale).invitation;

  return (
    <form action={formAction} className={styles.acceptForm}>
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.primaryButton} type="submit" disabled={pending}>
        {pending ? strings.joining : strings.accept}
      </button>
      <Link className={styles.dashboardLink} href="/dashboard">
        {strings.returnDashboard}
      </Link>
    </form>
  );
}
