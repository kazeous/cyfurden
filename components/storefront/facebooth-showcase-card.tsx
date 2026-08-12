import Image from "next/image";
import Link from "next/link";
import { getPublicFaceboothStrings } from "@/lib/i18n/facebooth-public";
import type { Locale } from "@/lib/i18n";
import styles from "./facebooth-showcase-card.module.css";

export type FaceboothShowcaseCardData = {
  sceneName: string;
  merchCount: number;
  previewUrl: string | null;
};

export function FaceboothShowcaseCard({
  boothSlug,
  locale,
  showcase,
}: {
  boothSlug: string;
  locale: Locale;
  showcase: FaceboothShowcaseCardData;
}) {
  const strings = getPublicFaceboothStrings(locale);
  return (
    <section
      className={styles.card}
      aria-labelledby="facebooth-storefront-card-title"
    >
      <div className={styles.preview}>
        {showcase.previewUrl ? (
          <Image
            alt=""
            fill
            sizes="(max-width: 720px) 100vw, 48vw"
            src={showcase.previewUrl}
            unoptimized
          />
        ) : (
          <div className={styles.previewFallback} aria-hidden="true">
            <span>3D</span>
            <i />
            <b />
          </div>
        )}
      </div>
      <div className={styles.copy}>
        <p>{strings.cardEyebrow}</p>
        <h2 id="facebooth-storefront-card-title">{strings.cardTitle}</h2>
        <strong>{showcase.sceneName}</strong>
        <span>{strings.cardDescription(showcase.merchCount)}</span>
        <Link href={`/s/${encodeURIComponent(boothSlug)}/facebooth`}>
          {strings.openShowcase}
        </Link>
      </div>
    </section>
  );
}
