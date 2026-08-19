import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { requireUser } from "@/lib/authorization";
import { getDefaultBoothSection } from "@/lib/booth-sections";
import { countOwnedBooths } from "@/lib/booth-limit";
import { db } from "@/lib/db";
import { parseBilingual } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { SignOutButton } from "./sign-out-button";
import styles from "./dashboard.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).dashboard;
  return {
    title: strings.metadataTitle,
    description: strings.metadataDescription,
  };
}

function BoothMark({
  name,
  logoObjectKey,
}: {
  name: string;
  logoObjectKey: string | null;
}) {
  const logoUrl = logoObjectKey
    ? resolveOracleImageUrl({ objectKey: logoObjectKey })
    : undefined;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <span className={styles.boothMark}>
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={52} height={52} unoptimized />
      ) : (
        initials || "C"
      )}
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5m0-5-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const messages = await searchParams;
  const [session, locale] = await Promise.all([
    requireUser(),
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.dashboard;
  const common = workspaceStrings.common;
  const memberships = await db.boothMembership.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      booth: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const ownedCount = countOwnedBooths(
    session.user.id,
    memberships.map((membership) => membership.booth),
  );
  const joinedCount = memberships.length - ownedCount;

  return (
    <main className={styles.dashboardShell}>
      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/"
          aria-label={strings.storefrontAria}
        >
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>{common.brandSubline}</small>
          </span>
        </Link>

        <div className={styles.accountActions}>
          <LanguageToggle
            current={locale}
            redirectTo="/dashboard"
            label={common.language}
          />
          <Link
            aria-label={strings.accountSecurity}
            className={styles.securityLink}
            href="/account"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 19 6v5.2c0 4.2-2.8 7.8-7 9.3-4.2-1.5-7-5.1-7-9.3V6l7-2.5Z" />
              <path d="M9.5 11.8 11.2 13.5l3.5-3.8" />
            </svg>
            <span>{strings.accountSecurity}</span>
          </Link>
          <span className={styles.accountName}>
            {session.user.name || session.user.email}
          </span>
          <SignOutButton locale={locale} />
        </div>
      </header>

      <section className={styles.workspace} aria-labelledby="dashboard-title">
        {messages.deleted ? (
          <p className={styles.notice} role="status">
            {strings.deletedNotice}
          </p>
        ) : null}
        <div className={styles.pageHeader}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>{strings.eyebrow}</p>
            <h1 id="dashboard-title">{strings.title}</h1>
            <p>{strings.description}</p>
            <p className={styles.boothCounter}>
              <strong>{strings.ownedCount(ownedCount)}</strong>
              <small>
                {strings.joinedDoesNotCount}
                {joinedCount > 0 ? strings.joinedCount(joinedCount) : ""}
              </small>
            </p>
          </div>
          <Link className={styles.headerAction} href="/dashboard/new">
            <span aria-hidden="true">+</span>
            {strings.createBooth}
          </Link>
        </div>

        {memberships.length ? (
          <div className={styles.boothGrid}>
            {memberships.map(({ booth, role }) => {
              const boothName = parseBilingual(booth.name, locale);
              const isPublished = booth.status === "PUBLISHED";
              const isStaff = role === "STAFF";
              const workspaceSection = getDefaultBoothSection(
                role,
                booth.status,
              );
              return (
                <article className={styles.boothCard} key={booth.id}>
                  <div className={styles.boothCardHead}>
                    <BoothMark
                      name={boothName}
                      logoObjectKey={booth.logoObjectKey}
                    />
                    <div className={styles.boothIdentity}>
                      <h2>{boothName}</h2>
                      <span>cyfurden · /s/{booth.slug}</span>
                    </div>
                  </div>

                  <div className={styles.boothMeta}>
                    <span
                      className={styles.statusBadge}
                      data-status={booth.status}
                    >
                      <span aria-hidden="true" />
                      {common.boothStatusLabels[booth.status] ?? booth.status}
                    </span>
                    <span className={styles.roleBadge}>
                      {common.roleLabels[role] ?? role}
                    </span>
                  </div>

                  <p className={styles.boothSummary}>
                    {isStaff
                      ? strings.staffSummary
                      : isPublished
                        ? strings.publishedSummary
                        : strings.draftSummary}
                  </p>

                  <div className={styles.boothActions}>
                    <Link
                      className={styles.primaryAction}
                      href={`/manage/${booth.id}/${workspaceSection}`}
                    >
                      {isStaff
                        ? strings.openOrders
                        : isPublished
                          ? strings.manageBooth
                          : strings.continueSetup}
                      <ArrowIcon />
                    </Link>
                    {isPublished ? (
                      <Link
                        className={styles.secondaryAction}
                        href={`/s/${booth.slug}`}
                      >
                        {strings.viewStorefront}
                        <ExternalIcon />
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyMark} aria-hidden="true">
              C
            </span>
            <h2>{strings.emptyTitle}</h2>
            <p>{strings.emptyBody}</p>
            <Link className={styles.headerAction} href="/dashboard/new">
              {strings.createBooth}
              <ArrowIcon />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
