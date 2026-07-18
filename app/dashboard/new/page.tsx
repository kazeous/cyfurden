import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/authorization";
import { CreateBoothForm } from "./create-booth-form";
import styles from "../dashboard.module.css";

export const metadata: Metadata = {
  title: "Create a booth",
};

export default async function NewBoothPage() {
  await requireUser("/dashboard/new");

  return (
    <main className={styles.newPage}>
      <div className={styles.newCard}>
        <Link className={styles.backLink} href="/dashboard">
          <span aria-hidden="true">←</span> Back to your booths
        </Link>

        <div className={styles.newHeading}>
          <p className={styles.eyebrow}>New workspace</p>
          <h1>Create a booth</h1>
          <p>
            Give your booth a name and public address. It starts as a private
            draft with manual bank-transfer payments and gacha turned off.
          </p>
        </div>

        <CreateBoothForm />

        <p className={styles.setupNote}>
          You’ll be the owner. Storefront, payment, promotion, and team settings
          can be completed from the booth workspace.
        </p>
      </div>
    </main>
  );
}
