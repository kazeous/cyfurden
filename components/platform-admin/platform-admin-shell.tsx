import Link from "next/link";
import type { ReactNode } from "react";
import type { PlatformRoleName } from "@/lib/platform-policy";
import type { Locale } from "@/lib/i18n";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import {
  PlatformLocaleToggle,
  PlatformMobileAccountMenu,
  PlatformSignOutButton,
} from "./platform-admin-controls";
import { PlatformAdminNav } from "./platform-admin-nav";
import styles from "./platform-admin.module.css";

export function PlatformAdminShell({
  children,
  locale,
  role,
  user,
}: {
  children: ReactNode;
  locale: Locale;
  role: PlatformRoleName;
  user: { id: string; name: string; email: string };
}) {
  const strings = getPlatformAdminStrings(locale).shell;
  const userLabel = user.name || user.email;
  const lifecycleEnabled = role !== "PLATFORM_VIEWER";

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar} aria-label={strings.navigationLabel}>
        <Link className={styles.brand} href="/admin">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>{strings.brandSubline}</small>
          </span>
        </Link>

        <div className={styles.consoleIdentity}>
          <span>{strings.consoleLabel}</span>
          <strong>{strings.roles[role]}</strong>
          <small>
            {lifecycleEnabled ? strings.mutationEnabled : strings.readOnly}
          </small>
        </div>

        <nav aria-label={strings.navigationLabel}>
          <PlatformAdminNav locale={locale} />
        </nav>

        <p className={styles.readOnlyNote}>
          {lifecycleEnabled ? strings.mutationNote : strings.readOnlyNote}
        </p>

        <div className={styles.sidebarUtilities}>
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
          <div className={styles.accountIdentity}>
            <span>{strings.signedInAs}</span>
            <strong>{userLabel}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.mobileTopbar}>
          <Link className={styles.mobileBrand} href="/admin">
            <span className={styles.brandMark} aria-hidden="true">
              C
            </span>
            <span>
              <strong>Cyfurden</strong>
              <small>
                {lifecycleEnabled ? strings.mutationEnabled : strings.readOnly}
              </small>
            </span>
          </Link>
          <PlatformMobileAccountMenu locale={locale} userLabel={userLabel} />
        </header>

        <main className={styles.main}>{children}</main>

        <nav
          aria-label={strings.mobileNavigationLabel}
          className={styles.mobileBottomNav}
        >
          <PlatformAdminNav locale={locale} />
        </nav>
      </div>
    </div>
  );
}

export function PlatformPageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {back ? (
          <Link className={styles.backLink} href={back.href}>
            <span aria-hidden="true">←</span>
            {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function PlatformStatusBadge({
  state,
  label,
}: {
  state: string;
  label: string;
}) {
  return (
    <span className={styles.statusBadge} data-state={state}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export function PlatformPagination({
  basePath,
  page,
  total,
  totalPages,
  params,
  locale,
}: {
  basePath: string;
  page: number;
  total: number;
  totalPages: number;
  params: Record<string, string | undefined>;
  locale: Locale;
}) {
  const strings = getPlatformAdminStrings(locale).common;
  const hrefForPage = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return (
    <nav
      className={styles.pagination}
      aria-label={strings.page(page, totalPages)}
    >
      <span>{strings.records(total)}</span>
      <div>
        {page > 1 ? (
          <Link href={hrefForPage(page - 1)}>{strings.previous}</Link>
        ) : (
          <span aria-disabled="true">{strings.previous}</span>
        )}
        <strong>{strings.page(page, totalPages)}</strong>
        {page < totalPages ? (
          <Link href={hrefForPage(page + 1)}>{strings.next}</Link>
        ) : (
          <span aria-disabled="true">{strings.next}</span>
        )}
      </div>
    </nav>
  );
}

export { styles as platformAdminStyles };
