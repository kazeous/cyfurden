import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { SignOutButton } from "./sign-out-button";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Your booths",
  description: "Choose a Cyfurden booth to manage or create a new one.",
};

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
  const session = await requireUser();
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

  return (
    <main className={styles.dashboardShell}>
      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/"
          aria-label="Cyfurden storefront"
        >
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>Cyfurden</strong>
            <small>Artist booth studio</small>
          </span>
        </Link>

        <div className={styles.accountActions}>
          <span className={styles.accountName}>
            {session.user.name || session.user.email}
          </span>
          <SignOutButton />
        </div>
      </header>

      <section className={styles.workspace} aria-labelledby="dashboard-title">
        {messages.deleted ? (
          <p className={styles.notice} role="status">
            Booth deleted successfully.
          </p>
        ) : null}
        <div className={styles.pageHeader}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Booth workspaces</p>
            <h1 id="dashboard-title">Your booths</h1>
            <p>
              Choose a booth to update its storefront, products, and orders.
            </p>
          </div>
          <Link className={styles.headerAction} href="/dashboard/new">
            <span aria-hidden="true">+</span>
            Create booth
          </Link>
        </div>

        {memberships.length ? (
          <div className={styles.boothGrid}>
            {memberships.map(({ booth, role }) => {
              const isPublished = booth.status === "PUBLISHED";
              return (
                <article className={styles.boothCard} key={booth.id}>
                  <div className={styles.boothCardHead}>
                    <BoothMark
                      name={booth.name}
                      logoObjectKey={booth.logoObjectKey}
                    />
                    <div className={styles.boothIdentity}>
                      <h2>{booth.name}</h2>
                      <span>cyfurden · /s/{booth.slug}</span>
                    </div>
                  </div>

                  <div className={styles.boothMeta}>
                    <span
                      className={styles.statusBadge}
                      data-status={booth.status}
                    >
                      <span aria-hidden="true" />
                      {isPublished
                        ? "Published"
                        : booth.status === "ARCHIVED"
                          ? "Archived"
                          : "Draft"}
                    </span>
                    <span className={styles.roleBadge}>
                      {role.toLowerCase()}
                    </span>
                  </div>

                  <p className={styles.boothSummary}>
                    {isPublished
                      ? "Live for visitors. Keep the catalogue and order queue current."
                      : "Private until you publish. Finish the storefront and payment details first."}
                  </p>

                  <div className={styles.boothActions}>
                    <Link
                      className={styles.primaryAction}
                      href={`/manage/${booth.id}/${isPublished ? "orders" : "storefront"}`}
                    >
                      {isPublished ? "Manage booth" : "Continue setup"}
                      <ArrowIcon />
                    </Link>
                    {isPublished ? (
                      <Link
                        className={styles.secondaryAction}
                        href={`/s/${booth.slug}`}
                      >
                        View storefront
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
            <h2>Create your first booth</h2>
            <p>
              Start with a private draft, add products and payment details, then
              publish when everything is ready.
            </p>
            <Link className={styles.headerAction} href="/dashboard/new">
              Create booth
              <ArrowIcon />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
