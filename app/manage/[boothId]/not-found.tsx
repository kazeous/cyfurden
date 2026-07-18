import Link from "next/link";
import { adminStyles as styles } from "@/components/admin/admin-shell";

export default function BoothNotFound() {
  return (
    <div className={styles.emptyState}>
      <div>
        <span className={styles.emptyIcon} aria-hidden="true">
          ◇
        </span>
        <h1>Booth workspace unavailable</h1>
        <p>
          This booth does not exist, or your account does not have access to it.
        </p>
        <Link className={styles.button} href="/dashboard">
          Return to your booths
        </Link>
      </div>
    </div>
  );
}
