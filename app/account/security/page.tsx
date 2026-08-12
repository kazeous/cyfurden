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

export default async function AccountSecurityPage() {
  const [session, locale] = await Promise.all([
    requireUser("/account/security"),
    readLocaleCookie(),
  ]);
  const t = translate(locale, "publicAuth");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      twoFactorEnabled: true,
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
        <Link className={styles.back} href="/dashboard">
          ← {t.securityBack}
        </Link>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>{t.securityEyebrow}</p>
          <h1>{t.securityTitle}</h1>
          <p>{t.securityBody}</p>
        </header>
        <TwoFactorSettings
          credentialEnabled={user.accounts.length > 0}
          initialEnabled={user.twoFactorEnabled === true}
          locale={locale}
          platformGrantActive={user.platformRoleGrant?.status === "ACTIVE"}
          platformSessionAuthenticated={Boolean(
            session.session.platformAuthenticatedAt,
          )}
        />
      </section>
    </main>
  );
}
