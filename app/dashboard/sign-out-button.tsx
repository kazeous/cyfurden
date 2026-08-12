"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./dashboard.module.css";

export function SignOutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const strings = getWorkspaceStrings(locale).dashboard;

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      aria-label={pending ? strings.signingOut : strings.signOut}
      className={styles.signOutButton}
      type="button"
      onClick={handleSignOut}
      disabled={pending}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H9m6-4 4-4-4-4m4 4H9" />
      </svg>
      <span>{pending ? strings.signingOut : strings.signOut}</span>
    </button>
  );
}
