import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import styles from "./admin.module.css";

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M19 12H5m7 7-7-7 7-7" />
    </svg>
  );
}

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

function BoothIdentity({
  booth,
  role,
}: {
  booth: { slug: string; name: string };
  role: string;
}) {
  return (
    <div className={styles.boothSelector}>
      <span className={styles.boothMark} aria-hidden="true">
        {booth.name.trim().slice(0, 1).toUpperCase() || "C"}
      </span>
      <span>
        <strong>{booth.name}</strong>
        <small>Active booth · {role.toLowerCase()}</small>
      </span>
    </div>
  );
}

export function AdminShell({
  booth,
  role,
  children,
}: {
  booth: { id: string; slug: string; name: string };
  role: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.adminApp}>
      <aside className={styles.adminSidebar} aria-label="Booth workspace">
        <Link className={styles.sidebarBrand} href="/dashboard">
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>Artist booth studio</small>
          </span>
        </Link>

        <BoothIdentity booth={booth} role={role} />

        <p className={styles.sidebarLabel}>Workspace</p>
        <nav className={styles.sectionNav} aria-label="Booth management">
          <AdminNav boothId={booth.id} role={role} />
        </nav>

        <div className={styles.sidebarLinks}>
          <Link className={styles.sidebarLink} href={`/s/${booth.slug}`}>
            <ExternalIcon />
            <span>View storefront</span>
          </Link>
          <Link className={styles.sidebarLink} href="/dashboard">
            <GridIcon />
            <span>All booths</span>
          </Link>
        </div>

        <p className={styles.sidebarHint}>
          Changes stay private until you publish the storefront.
        </p>
      </aside>

      <div className={styles.adminWorkspace}>
        <header className={styles.adminTopbar}>
          <div className={styles.mobileWorkspaceIdentity}>
            <Link
              className={styles.iconLink}
              href="/dashboard"
              aria-label="Back to all booths"
              title="Back to all booths"
            >
              <ArrowLeftIcon />
            </Link>
            <div className={styles.mobileBoothCopy}>
              <strong>{booth.name}</strong>
              <small>{role.toLowerCase()} workspace</small>
            </div>
          </div>
          <div className={styles.mobileTopbarActions}>
            <Link
              className={styles.iconLink}
              href={`/s/${booth.slug}`}
              aria-label="View public storefront"
              title="View public storefront"
            >
              <ExternalIcon />
            </Link>
          </div>
        </header>

        <main className={styles.adminMain}>{children}</main>

        <nav className={styles.mobileBottomNav} aria-label="Booth management">
          <AdminNav boothId={booth.id} role={role} />
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

export function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <article className={styles.metricCard}>
      <span className={styles.metricIcon} aria-hidden="true">
        {icon}
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}

export { styles as adminStyles };
