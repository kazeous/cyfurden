import Link from "next/link";
import type { ReactNode } from "react";
import { getDefaultBoothSection } from "@/lib/booth-sections";
import type { Locale } from "@/lib/i18n";
import { getAdminShellStrings } from "@/lib/i18n/admin-shell";
import { AdminNav } from "./admin-nav";
import { AdminOverflowMenu } from "./admin-overflow-menu";
import styles from "./admin.module.css";

function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 5h5v5m0-5-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

export type AdminBoothOption = {
  id: string;
  name: string;
  role: string;
  slug: string;
  status: string;
};

function BoothSwitcher({
  booth,
  booths,
  locale,
  role,
}: {
  booth: { id: string; slug: string; name: string };
  booths: AdminBoothOption[];
  locale: Locale;
  role: string;
}) {
  const strings = getAdminShellStrings(locale);

  return (
    <details className={styles.boothSwitcher}>
      <summary
        className={styles.boothSelector}
        aria-label={`${strings.switchBooth}: ${booth.name}`}
      >
        <span className={styles.boothMark} aria-hidden="true">
          {booth.name.trim().slice(0, 1).toUpperCase() || "C"}
        </span>
        <span>
          <strong>{booth.name}</strong>
          <small>{strings.activeBooth(role)}</small>
        </span>
        <span className={styles.switcherChevron}>
          <ChevronIcon />
        </span>
      </summary>

      <div className={styles.boothSwitcherPanel}>
        <p>{strings.switchBooth}</p>
        <div className={styles.boothSwitcherList}>
          {booths.map((option) => {
            const current = option.id === booth.id;
            const section = getDefaultBoothSection(option.role, option.status);
            return (
              <Link
                href={`/manage/${option.id}/${section}`}
                key={option.id}
                aria-current={current ? "page" : undefined}
              >
                <span className={styles.switcherBoothMark} aria-hidden="true">
                  {option.name.trim().slice(0, 1).toUpperCase() || "C"}
                </span>
                <span>
                  <strong>{option.name}</strong>
                  <small>
                    {current
                      ? strings.currentBooth
                      : strings.roleWorkspace(option.role)}
                  </small>
                </span>
                {current ? (
                  <span className={styles.switcherCheck}>
                    <CheckIcon />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <div className={styles.boothSwitcherActions}>
          <Link href="/dashboard">
            <GridIcon />
            {strings.allBooths}
          </Link>
          <Link href="/dashboard/new">
            <span aria-hidden="true">+</span>
            {strings.createBooth}
          </Link>
        </div>
      </div>
    </details>
  );
}

export function AdminShell({
  booth,
  booths,
  locale,
  productCount,
  role,
  children,
}: {
  booth: { id: string; slug: string; name: string };
  booths: AdminBoothOption[];
  locale: Locale;
  productCount: number;
  role: string;
  children: ReactNode;
}) {
  const strings = getAdminShellStrings(locale);
  const canManageSettings = role === "OWNER" || role === "ADMIN";

  return (
    <div className={styles.adminApp}>
      <aside
        className={styles.adminSidebar}
        aria-label={strings.boothWorkspaceAria}
      >
        <Link className={styles.sidebarBrand} href="/dashboard">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>{strings.brandSubline}</small>
          </span>
        </Link>

        <div className={styles.sidebarWorkspaceControls}>
          <BoothSwitcher
            booth={booth}
            booths={booths}
            locale={locale}
            role={role}
          />
          <AdminOverflowMenu
            boothId={booth.id}
            canManageSettings={canManageSettings}
            locale={locale}
          />
        </div>

        <p className={styles.sidebarLabel}>{strings.workspaceLabel}</p>
        <nav
          className={styles.sectionNav}
          aria-label={strings.boothManagementAria}
        >
          <AdminNav
            boothId={booth.id}
            locale={locale}
            productCount={productCount}
            role={role}
          />
        </nav>

        <div className={styles.sidebarLinks}>
          <Link className={styles.sidebarLink} href={`/s/${booth.slug}`}>
            <ExternalIcon />
            <span>{strings.viewStorefront}</span>
          </Link>
          <Link className={styles.sidebarLink} href="/dashboard">
            <GridIcon />
            <span>{strings.allBooths}</span>
          </Link>
        </div>

        <p className={styles.sidebarHint}>{strings.privateChangesHint}</p>
      </aside>

      <div className={styles.adminWorkspace}>
        <header className={styles.adminTopbar}>
          <div className={styles.mobileWorkspaceIdentity}>
            <BoothSwitcher
              booth={booth}
              booths={booths}
              locale={locale}
              role={role}
            />
          </div>
          <div className={styles.mobileTopbarActions}>
            <Link
              className={styles.iconLink}
              href={`/s/${booth.slug}`}
              aria-label={strings.viewStorefront}
              title={strings.viewStorefront}
            >
              <ExternalIcon />
            </Link>
            <AdminOverflowMenu
              boothId={booth.id}
              canManageSettings={canManageSettings}
              locale={locale}
            />
          </div>
        </header>

        <main className={styles.adminMain}>{children}</main>

        <nav
          className={styles.mobileBottomNav}
          aria-label={strings.boothManagementAria}
        >
          <AdminNav
            boothId={booth.id}
            locale={locale}
            productCount={productCount}
            role={role}
          />
        </nav>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className={styles.headingActions}>{actions}</div> : null}
    </div>
  );
}

export { styles as adminStyles };
