"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  canAccessBoothSection,
  type BoothSectionId,
} from "@/lib/booth-sections";
import type { Locale } from "@/lib/i18n";
import { getAdminShellStrings } from "@/lib/i18n/admin-shell";
import styles from "./admin.module.css";

const sections: Array<{
  id: Exclude<BoothSectionId, "settings" | "payments" | "shipping">;
  labelKey:
    | "storefrontLabel"
    | "ordersLabel"
    | "productsLabel"
    | "promotionsLabel"
    | "faceboothLabel"
    | "gachaLabel"
    | "teamLabel";
  descriptionKey:
    | "storefrontDescription"
    | "ordersDescription"
    | "productsDescription"
    | "promotionsDescription"
    | "faceboothDescription"
    | "gachaDescription"
    | "teamDescription";
  mobileLabelKey?: "faceboothMobileLabel";
  icon: ReactNode;
}> = [
  {
    id: "storefront",
    labelKey: "storefrontLabel",
    descriptionKey: "storefrontDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 5.5h16v13H4zM4 9h16M8 5.5v3.5M16 5.5v3.5" />
      </svg>
    ),
  },
  {
    id: "orders",
    labelKey: "ordersLabel",
    descriptionKey: "ordersDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 4.5h14v15H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    id: "products",
    labelKey: "productsLabel",
    descriptionKey: "productsDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 4 7 4v8l-7 4-7-4V8l7-4Z M5.5 8 12 12l6.5-4M12 12v8" />
      </svg>
    ),
  },
  {
    id: "promotions",
    labelKey: "promotionsLabel",
    descriptionKey: "promotionsDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4.5 7.5h15v9h-15zM12 7.5v9M9.5 7.5C7 7.5 6 4.5 8.2 4.5 10 4.5 12 7.5 12 7.5s2-3 3.8-3c2.2 0 1.2 3-1.3 3" />
      </svg>
    ),
  },
  {
    id: "facebooth",
    labelKey: "faceboothLabel",
    mobileLabelKey: "faceboothMobileLabel",
    descriptionKey: "faceboothDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 19.5h16M6 17V7.5h12V17M9 17v-4h6v4M8 7.5V4.5h8v3" />
      </svg>
    ),
  },
  {
    id: "gacha",
    labelKey: "gachaLabel",
    descriptionKey: "gachaDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
      </svg>
    ),
  },
  {
    id: "team",
    labelKey: "teamLabel",
    descriptionKey: "teamDescription",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a5 5 0 0 1 10 0M16 11a2.5 2.5 0 1 0 0-5M15.5 14.5a4.2 4.2 0 0 1 5 4.5" />
      </svg>
    ),
  },
];

export function AdminNav({
  boothId,
  locale,
  productCount,
  role,
}: {
  boothId: string;
  locale: Locale;
  productCount: number;
  role: string;
}) {
  const pathname = usePathname();
  const strings = getAdminShellStrings(locale);
  return (
    <div className={styles.adminNavList}>
      {sections
        .filter((section) => canAccessBoothSection(role, section.id))
        .map((section) => {
          const href = `/manage/${boothId}/${section.id}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const label = strings[section.labelKey];
          const mobileLabel = section.mobileLabelKey
            ? strings[section.mobileLabelKey]
            : label;
          const description = strings[section.descriptionKey];
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={styles.sectionLink}
              data-active={active || undefined}
              href={href}
              key={section.id}
              title={description}
            >
              <span className={styles.sectionIcon}>{section.icon}</span>
              <span className={styles.sectionLinkCopy}>
                <strong>
                  <span className={styles.fullNavLabel}>{label}</span>
                  <span className={styles.mobileNavLabel}>{mobileLabel}</span>
                  {section.id === "products" ? (
                    <span
                      className={styles.navCount}
                      aria-label={strings.productsCount(productCount)}
                    >
                      {productCount}
                    </span>
                  ) : null}
                </strong>
                <small>{description}</small>
              </span>
            </Link>
          );
        })}
    </div>
  );
}
