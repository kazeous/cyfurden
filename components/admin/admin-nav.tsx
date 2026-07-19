"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

type SectionId = "storefront" | "orders" | "products" | "gacha" | "team";

const sections: Array<{
  id: SectionId;
  label: string;
  mobileLabel?: string;
  description: string;
  icon: ReactNode;
  staffVisible: boolean;
}> = [
  {
    id: "storefront",
    label: "Storefront",
    mobileLabel: "Store",
    description: "Edit public presentation",
    staffVisible: false,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 5.5h16v13H4zM4 9h16M8 5.5v3.5M16 5.5v3.5" />
      </svg>
    ),
  },
  {
    id: "orders",
    label: "Orders",
    description: "Review and prepare reservations",
    staffVisible: true,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    id: "products",
    label: "Products",
    description: "Manage catalogue and stock",
    staffVisible: true,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 4 7 4v8l-7 4-7-4V8l7-4Z M5.5 8 12 12l6.5-4M12 12v8" />
      </svg>
    ),
  },
  {
    id: "gacha",
    label: "Gacha",
    description: "Configure free play",
    staffVisible: false,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
      </svg>
    ),
  },
  {
    id: "team",
    label: "Team",
    description: "Members and access",
    staffVisible: true,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a5 5 0 0 1 10 0M16 11a2.5 2.5 0 1 0 0-5M15.5 14.5a4.2 4.2 0 0 1 5 4.5" />
      </svg>
    ),
  },
];

export function AdminNav({ boothId, role }: { boothId: string; role: string }) {
  const pathname = usePathname();
  const normalizedRole = role.toUpperCase();
  const canConfigure = normalizedRole === "OWNER" || normalizedRole === "ADMIN";

  return (
    <div className={styles.adminNavList}>
      {sections
        .filter((section) => canConfigure || section.staffVisible)
        .map((section) => {
          const href = `/manage/${boothId}/${section.id}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={styles.sectionLink}
              data-active={active || undefined}
              href={href}
              key={section.id}
              title={section.description}
            >
              <span className={styles.sectionIcon}>{section.icon}</span>
              <span className={styles.sectionLinkCopy}>
                <strong>
                  <span className={styles.fullNavLabel}>{section.label}</span>
                  <span className={styles.mobileNavLabel}>
                    {section.mobileLabel ?? section.label}
                  </span>
                </strong>
                <small>{section.description}</small>
              </span>
            </Link>
          );
        })}
    </div>
  );
}
