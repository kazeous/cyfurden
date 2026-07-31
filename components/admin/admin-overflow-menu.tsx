"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { setLocaleAction } from "@/app/actions";
import { signOut } from "@/lib/auth-client";
import {
  localeDisplayCodes,
  localeDisplayNames,
  supportedLocales,
  type Locale,
} from "@/lib/i18n";
import { getAdminShellStrings } from "@/lib/i18n/admin-shell";
import { OrderAlertsControl } from "./order-alerts-control";
import styles from "./admin.module.css";

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="12" cy="19" r="1.3" />
    </svg>
  );
}

export function AdminOverflowMenu({
  boothId,
  canManageSettings,
  locale,
}: {
  boothId: string;
  canManageSettings: boolean;
  locale: Locale;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const strings = getAdminShellStrings(locale);
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <details className={styles.overflowMenu}>
      <summary
        className={styles.iconButton}
        aria-label={strings.moreActions}
        title={strings.moreActions}
      >
        <MoreIcon />
      </summary>
      <div className={styles.overflowPanel}>
        <section className={styles.languageMenu} aria-label={strings.language}>
          <span>{strings.language}</span>
          <form action={setLocaleAction}>
            <input type="hidden" name="redirectTo" value={pathname} />
            {supportedLocales.map((nextLocale) => (
              <button
                key={nextLocale}
                type="submit"
                name="locale"
                value={nextLocale}
                aria-pressed={nextLocale === locale}
                aria-label={localeDisplayNames[nextLocale]}
                lang={nextLocale}
                data-active={nextLocale === locale || undefined}
              >
                {localeDisplayCodes[nextLocale]}
              </button>
            ))}
          </form>
        </section>

        {canManageSettings ? (
          <Link
            className={styles.menuLink}
            href={`/manage/${boothId}/settings`}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19 12l2-1-2-3-2 .5-1.5-1L15 5h-6l-.5 2.5-1.5 1L5 8l-2 3 2 1v2l-2 1 2 3 2-.5 1.5 1L9 21h6l.5-2.5 1.5-1 2 .5 2-3-2-1v-2Z" />
              </svg>
            </span>
            <span>
              <strong>{strings.settings}</strong>
              <small>{strings.settingsDescription}</small>
            </span>
          </Link>
        ) : null}

        <OrderAlertsControl boothId={boothId} locale={locale} />

        <button
          className={styles.signOutMenuButton}
          type="button"
          onClick={handleSignOut}
          disabled={pending}
        >
          <span className={styles.menuItemIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M9 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H9m6-4 4-4-4-4m4 4H9" />
            </svg>
          </span>
          <span>
            <strong>{pending ? strings.signingOut : strings.signOut}</strong>
            <small>{strings.accountDescription}</small>
          </span>
        </button>
      </div>
    </details>
  );
}
