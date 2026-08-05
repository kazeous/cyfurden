import Link from "next/link";
import { adminStyles as styles } from "@/components/admin/admin-shell";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";

export default async function BoothNotFound() {
  const strings = getWorkspaceStrings(await readLocaleCookie()).notFound;
  return (
    <div className={styles.emptyState}>
      <div>
        <span className={styles.emptyIcon} aria-hidden="true">
          ◇
        </span>
        <h1>{strings.title}</h1>
        <p>{strings.body}</p>
        <Link className={styles.button} href="/dashboard">
          {strings.dashboard}
        </Link>
      </div>
    </div>
  );
}
