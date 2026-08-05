import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { requireUser } from "@/lib/authorization";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { CreateBoothForm } from "./create-booth-form";
import styles from "../dashboard.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).createBooth;
  return { title: strings.metadataTitle };
}

export default async function NewBoothPage() {
  const [, locale] = await Promise.all([
    requireUser("/dashboard/new"),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.createBooth;

  return (
    <main className={styles.newPage}>
      <div className={styles.newCard}>
        <Link className={styles.backLink} href="/dashboard">
          <span aria-hidden="true">←</span> {strings.back}
        </Link>

        <LanguageToggle
          current={locale}
          redirectTo="/dashboard/new"
          label={workspaceStrings.common.language}
        />

        <div className={styles.newHeading}>
          <p className={styles.eyebrow}>{strings.eyebrow}</p>
          <h1>{strings.title}</h1>
          <p>{strings.description}</p>
        </div>

        <CreateBoothForm locale={locale} />

        <p className={styles.setupNote}>{strings.ownerNote}</p>
      </div>
    </main>
  );
}
