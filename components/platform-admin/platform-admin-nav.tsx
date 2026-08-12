"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import styles from "./platform-admin.module.css";

const sections: Array<{
  href: string;
  label: "overview" | "users" | "booths" | "storage" | "audit";
  mobileLabel?: "overviewShort";
  icon: ReactNode;
}> = [
  {
    href: "/admin",
    label: "overview",
    mobileLabel: "overviewShort",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "users",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a5 5 0 0 1 10 0M16 11a2.5 2.5 0 1 0 0-5M15.5 14.5a4.2 4.2 0 0 1 5 4.5" />
      </svg>
    ),
  },
  {
    href: "/admin/booths",
    label: "booths",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 9h16M5 9v10h14V9M4 9l2-5h12l2 5M9 19v-5h6v5" />
      </svg>
    ),
  },
  {
    href: "/admin/storage",
    label: "storage",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    ),
  },
  {
    href: "/admin/audit",
    label: "audit",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
  },
];

export function PlatformAdminNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const strings = getPlatformAdminStrings(locale).shell;

  return (
    <div className={styles.navList}>
      {sections.map((section) => {
        const active =
          section.href === "/admin"
            ? pathname === section.href
            : pathname === section.href ||
              pathname.startsWith(`${section.href}/`);
        const label = strings[section.label];
        const mobileLabel = section.mobileLabel
          ? strings[section.mobileLabel]
          : label;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={styles.navLink}
            data-active={active || undefined}
            href={section.href}
            key={section.href}
          >
            <span className={styles.navIcon}>{section.icon}</span>
            <span className={styles.navLabel}>{label}</span>
            <span className={styles.mobileNavLabel}>{mobileLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
