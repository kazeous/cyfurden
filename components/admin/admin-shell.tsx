import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

const sections = [
  { id: "storefront", label: "Storefront", icon: "▤" },
  { id: "orders", label: "Orders Queue", icon: "▣" },
  { id: "products", label: "Products", icon: "◇" },
  { id: "gacha", label: "Gacha", icon: "✦" },
  { id: "team", label: "Team", icon: "♧" },
] as const;

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
      <header className={styles.adminTopbar}>
        <div className={styles.workspaceIdentity}>
          <Link
            href={`/s/${booth.slug}`}
            className={styles.iconLink}
            aria-label="Back to public storefront"
            title="Back to public storefront"
          >
            ←
          </Link>
          <Link
            href="/dashboard"
            className={styles.iconLink}
            aria-label="All booths"
            title="All booths"
          >
            ⊞
          </Link>
          <span className={styles.boothMark} aria-hidden="true">
            C
          </span>
          <span className={styles.workspaceCopy}>
            <strong>{booth.name}</strong>
            <small>Booth workspace</small>
          </span>
        </div>

        <nav className={styles.sectionNav} aria-label="Booth management">
          {sections.map((section) => (
            <Link
              key={section.id}
              href={`/manage/${booth.id}/${section.id}`}
              className={styles.sectionLink}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </Link>
          ))}
        </nav>

        <div className={styles.boothSelector}>
          <span aria-hidden="true">⌂</span>
          <span>
            <strong>{booth.name}</strong>
            <small>Active · {role.toLowerCase()}</small>
          </span>
        </div>
      </header>
      <main className={styles.adminMain}>{children}</main>
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
