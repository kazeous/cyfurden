"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import styles from "./dashboard.module.css";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      className={styles.signOutButton}
      type="button"
      onClick={handleSignOut}
      disabled={pending}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H9m6-4 4-4-4-4m4 4H9" />
      </svg>
      <span>{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
