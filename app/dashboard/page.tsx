import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import { SignOutButton } from "./sign-out-button";
import styles from "./dashboard.module.css";

export const metadata: Metadata = {
  title: "Your booths",
  description: "Choose a Cyfurden booth to manage or create a new one.",
};

function BoothMark({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return <span className={styles.boothMark}>{initials || "C"}</span>;
}

export default async function DashboardPage() {
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
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Your account</p>
          <h1 id="dashboard-title">Choose a booth</h1>
          <p>
            Manage a booth’s orders and catalogue, or visit its public
            storefront.
          </p>
        </div>

        <div className={styles.summary}>
          <strong>
            {memberships.length} {memberships.length === 1 ? "booth" : "booths"}
          </strong>
          <span>Only active booth memberships appear here.</span>
        </div>

        <div className={styles.boothGrid}>
          {memberships.map(({ booth, role }) => (
            <article className={styles.boothCard} key={booth.id}>
              <div className={styles.boothCardHead}>
                <BoothMark name={booth.name} />
                <div className={styles.boothIdentity}>
                  <h2>{booth.name}</h2>
                  <span>/s/{booth.slug}</span>
                </div>
                <span className={styles.roleBadge}>{role.toLowerCase()}</span>
              </div>

              <p className={styles.boothStatus}>
                <span aria-hidden="true" />
                {booth.status === "PUBLISHED"
                  ? "Published storefront"
                  : booth.status === "ARCHIVED"
                    ? "Archived booth"
                    : "Draft storefront"}
              </p>

              <div className={styles.boothActions}>
                <Link
                  className={styles.primaryAction}
                  href={`/manage/${booth.id}/orders`}
                >
                  Manage booth
                </Link>
                <Link
                  className={styles.secondaryAction}
                  href={`/s/${booth.slug}`}
                >
                  Storefront
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 5h5v5m0-5-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
                  </svg>
                </Link>
              </div>
            </article>
          ))}

          <Link className={styles.createCard} href="/dashboard/new">
            <span className={styles.plus} aria-hidden="true">
              +
            </span>
            <strong>
              {memberships.length
                ? "Create another booth"
                : "Create your first booth"}
            </strong>
            <span>Start a fresh storefront and invite your team later.</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
