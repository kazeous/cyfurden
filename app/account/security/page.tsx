import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import { translate, type Locale } from "@/lib/i18n";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import styles from "./security.module.css";
import { TwoFactorSettings } from "./two-factor-settings";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await readLocaleCookie()) as Locale;
  const t = translate(locale, "publicAuth");
  return { title: t.securityTitle, description: t.securityBody };
}

export function normalizePlatformSecurityReturnTo(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/admin") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://cyfurden.invalid");
    if (
      parsed.origin !== "https://cyfurden.invalid" ||
      !/^\/admin(?:\/|$)/.test(parsed.pathname)
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, locale] = await Promise.all([
    requireUser("/account/security"),
    readLocaleCookie(),
  ]);
  const rawSearchParams = await searchParams;
  const rawReturnTo = Array.isArray(rawSearchParams.returnTo)
    ? rawSearchParams.returnTo[0]
    : rawSearchParams.returnTo;
  const returnTo = normalizePlatformSecurityReturnTo(rawReturnTo);
  const t = translate(locale, "publicAuth");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      twoFactorEnabled: true,
      twoFactors: {
        where: { verified: true },
        select: { id: true },
        take: 1,
      },
      accounts: {
        where: { providerId: "credential", password: { not: null } },
        select: { id: true },
        take: 1,
      },
      platformRoleGrant: {
        select: { status: true },
      },
    },
  });

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.back} href={returnTo ?? "/account#two-factor"}>
          ← {returnTo ? t.securityBackPlatform : t.securityBack}
        </Link>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>{t.securityEyebrow}</p>
          <h1>{t.securityTitle}</h1>
          <p>{t.securityBody}</p>
        </header>
        <TwoFactorSettings
          credentialEnabled={user.accounts.length > 0}
          initialEnabled={
            user.twoFactorEnabled === true && user.twoFactors.length > 0
          }
          locale={locale}
          platformGrantActive={user.platformRoleGrant?.status === "ACTIVE"}
          platformSessionAuthenticated={Boolean(
            session.session.platformAuthenticatedAt,
          )}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}
