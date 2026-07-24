"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptTeamInvitationAction } from "@/app/manage/[boothId]/actions";
import styles from "./invitation.module.css";

export function InvitationAcceptanceForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    acceptTeamInvitationAction,
    {},
  );

  return (
    <form action={formAction} className={styles.acceptForm}>
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={styles.primaryButton} type="submit" disabled={pending}>
        {pending ? "Joining booth..." : "Accept invitation"}
      </button>
      <Link className={styles.dashboardLink} href="/dashboard">
        Return to dashboard
      </Link>
    </form>
  );
}
