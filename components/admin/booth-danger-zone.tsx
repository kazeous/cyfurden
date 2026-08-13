import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import styles from "./admin.module.css";

export function BoothDangerZone({
  boothName,
  locale,
}: {
  boothName: string;
  locale: Locale;
}) {
  const strings = getWorkspaceStrings(locale).danger;

  return (
    <section className={styles.dangerZone} aria-labelledby="delete-booth-title">
      <div>
        <p className={styles.dangerEyebrow}>{strings.eyebrow}</p>
        <h2 id="delete-booth-title">{strings.title(boothName)}</h2>
        <p>{strings.description}</p>
      </div>
      <p className={styles.dangerError}>{strings.delete}</p>
    </section>
  );
}
