"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { setLocaleAction } from "@/app/actions";
import { signOut } from "@/lib/auth-client";
import {
  localeDisplayCodes,
  localeDisplayNames,
  supportedLocales,
  type Locale,
} from "@/lib/i18n";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import styles from "./platform-admin.module.css";

export function PlatformLocaleToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const strings = getPlatformAdminStrings(locale).shell;
  const query = searchParams.toString();
  const redirectTo = query ? `${pathname}?${query}` : pathname;

  return (
    <form
      action={setLocaleAction}
      aria-label={strings.language}
      className={styles.localeToggle}
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {supportedLocales.map((option) => (
        <button
          aria-label={localeDisplayNames[option]}
          aria-pressed={option === locale}
          className={styles.localeButton}
          key={option}
          lang={option}
          name="locale"
          type="submit"
          value={option}
        >
          {localeDisplayCodes[option]}
        </button>
      ))}
    </form>
  );
}

export function PlatformSignOutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const strings = getPlatformAdminStrings(locale).shell;

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      aria-label={pending ? strings.signingOut : strings.signOut}
      className={styles.utilityLink}
      disabled={pending}
      onClick={handleSignOut}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M9 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H9m6-4 4-4-4-4m4 4H9" />
      </svg>
      <span>{pending ? strings.signingOut : strings.signOut}</span>
    </button>
  );
}

export function PlatformMobileAccountMenu({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const strings = getPlatformAdminStrings(locale).shell;
  return (
    <details className={styles.mobileAccountMenu}>
      <summary aria-label={`${strings.signedInAs} ${userLabel}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      </summary>
      <div className={styles.mobileAccountPanel}>
        <strong>{userLabel}</strong>
        <PlatformLocaleToggle locale={locale} />
        <Link className={styles.utilityLink} href="/dashboard">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
          </svg>
          <span>{strings.dashboard}</span>
        </Link>
        <Link className={styles.utilityLink} href="/account">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 3.5 19 6v5.2c0 4.2-2.8 7.8-7 9.3-4.2-1.5-7-5.1-7-9.3V6l7-2.5Z" />
            <path d="M9.5 11.8 11.2 13.5l3.5-3.8" />
          </svg>
          <span>{strings.accountSecurity}</span>
        </Link>
        <PlatformSignOutButton locale={locale} />
      </div>
    </details>
  );
}
