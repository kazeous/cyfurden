"use client";

import { useEffect, useMemo, useState } from "react";
import {
  bannerAvailability,
  gachaRarities,
  type PublishedGachaBanner,
  type PublishedGachaDocument,
  type PublishedGachaPoolEntry,
} from "@/lib/gacha-document";
import { drawGachaReward } from "@/lib/gacha-game";
import { parseBilingual, translate, type Locale } from "@/lib/i18n";
import { createBoothDateTimeFormat } from "@/lib/i18n/intl";
import styles from "./free-gacha.module.css";

type DrawDisplay = {
  reward: PublishedGachaPoolEntry;
  guaranteeApplied: boolean;
  sequence: number;
};

const rateKey = {
  COMMON: "common",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
} as const;

function secureRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 2 ** 32;
  }
  return Math.random();
}

function entryName(entry: PublishedGachaPoolEntry, locale: Locale) {
  return entry.productName && entry.variantLabel
    ? `${parseBilingual(entry.productName, locale)} · ${parseBilingual(entry.variantLabel, locale)}`
    : parseBilingual(entry.displayName, locale);
}

function initialBanner(banners: PublishedGachaBanner[], referenceTime: Date) {
  return (
    banners.find(
      (banner) => bannerAvailability(banner, referenceTime) === "live",
    ) ??
    banners.find(
      (banner) => bannerAvailability(banner, referenceTime) === "upcoming",
    ) ??
    banners[0]
  );
}

export function FreeGacha({
  document,
  boothSlug,
  locale,
  preview = false,
}: {
  document: PublishedGachaDocument;
  boothSlug: string;
  locale: Locale;
  preview?: boolean;
}) {
  const t = useMemo(() => translate(locale, "publicBooth"), [locale]);
  const referenceTime = useMemo(() => new Date(), []);
  const [selectedBannerId, setSelectedBannerId] = useState(
    () => initialBanner(document.banners, referenceTime).id,
  );
  const [progressByBanner, setProgressByBanner] = useState<
    Record<string, number>
  >({});
  const [hydrated, setHydrated] = useState(preview);
  const [result, setResult] = useState<DrawDisplay | null>(null);
  const storageKey = `cyfurden:gacha:${boothSlug}:${document.publishedAt}`;

  useEffect(() => {
    if (preview) return;
    const timer = globalThis.setTimeout(() => {
      try {
        const saved = globalThis.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as unknown;
          if (parsed && typeof parsed === "object") {
            const valid = Object.fromEntries(
              Object.entries(parsed).flatMap(([bannerId, value]) =>
                typeof value === "number" &&
                Number.isInteger(value) &&
                value >= 0
                  ? [[bannerId, value]]
                  : [],
              ),
            );
            setProgressByBanner(valid);
          }
        }
      } catch {
        // The game remains usable in memory when browser storage is unavailable.
      }
      setHydrated(true);
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [preview, storageKey]);

  useEffect(() => {
    if (preview || !hydrated) return;
    try {
      globalThis.localStorage.setItem(
        storageKey,
        JSON.stringify(progressByBanner),
      );
    } catch {
      // The current tab still keeps guarantee progress in memory.
    }
  }, [hydrated, preview, progressByBanner, storageKey]);

  const banner =
    document.banners.find((item) => item.id === selectedBannerId) ??
    document.banners[0];
  const availability = bannerAvailability(banner, referenceTime);
  const pityProgress = progressByBanner[banner.id] ?? 0;
  const rarityLabel = t.gachaRarityLabels[document.guaranteedRarity];
  const remaining = Math.max(1, document.guaranteedAt - pityProgress);
  const featured = [...banner.pool]
    .sort(
      (left, right) =>
        Number(right.featured) - Number(left.featured) ||
        left.sortOrder - right.sortOrder,
    )
    .slice(0, banner.featuredCount);
  const formatDate = (value: string) =>
    createBoothDateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(value),
    );
  const schedule =
    availability === "upcoming" && banner.startsAt
      ? t.gachaOpens(formatDate(banner.startsAt))
      : availability === "ended"
        ? t.gachaEnded
        : !banner.startsAt && !banner.endsAt
          ? t.gachaAlwaysOpen
          : t.gachaLiveNow;
  const scheduleRange =
    banner.startsAt && banner.endsAt
      ? t.gachaSchedule(
          formatDate(banner.startsAt),
          formatDate(
            new Date(new Date(banner.endsAt).getTime() - 1).toISOString(),
          ),
        )
      : null;

  const reveal = () => {
    if (!hydrated || availability !== "live") return;
    const draw = drawGachaReward({
      document,
      banner,
      pityProgress,
      rarityRandom: secureRandom(),
      rewardRandom: secureRandom(),
    });
    setProgressByBanner((current) => ({
      ...current,
      [banner.id]: draw.pityProgress,
    }));
    setResult((current) => ({
      reward: draw.reward,
      guaranteeApplied: draw.guaranteeApplied,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  };

  return (
    <section
      className={styles.gacha}
      data-theme={banner.theme || document.gameTheme}
      aria-labelledby={`gacha-title-${preview ? "preview" : boothSlug}`}
    >
      <header className={styles.intro}>
        <p className={styles.kicker}>
          {preview ? t.gachaPreviewLabel : t.gachaFreeLabel}
        </p>
        <h2 id={`gacha-title-${preview ? "preview" : boothSlug}`}>
          {parseBilingual(document.title, locale)}
        </h2>
        <p>{parseBilingual(document.introduction, locale)}</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.bannerRail} aria-label={t.gachaChooseBanner}>
          {document.banners.map((item) => {
            const itemAvailability = bannerAvailability(item, referenceTime);
            return (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === banner.id}
                onClick={() => {
                  setSelectedBannerId(item.id);
                  setResult(null);
                }}
              >
                <span>{parseBilingual(item.title, locale)}</span>
                <small>
                  {t.gachaBannerTypeLabels[item.type]} ·{" "}
                  {itemAvailability === "live"
                    ? t.gachaLiveNow
                    : itemAvailability === "upcoming" && item.startsAt
                      ? formatDate(item.startsAt)
                      : t.gachaEnded}
                </small>
              </button>
            );
          })}
        </nav>

        <div className={styles.stage}>
          <div className={styles.bannerHeading}>
            <div>
              <p className={styles.bannerType}>
                {t.gachaBannerTypeLabels[banner.type]} · {schedule}
                {scheduleRange ? ` · ${scheduleRange}` : ""}
              </p>
              <h3>{parseBilingual(banner.title, locale)}</h3>
              <p>{parseBilingual(banner.copy, locale)}</p>
            </div>
            <span className={styles.freeBadge}>{t.gachaFreeLabel}</span>
          </div>

          <div className={styles.featured}>
            <strong>{t.gachaLineupHeading}</strong>
            <ul>
              {featured.map((entry) => (
                <li key={entry.id} data-rarity={entry.rarity}>
                  <span>{entryName(entry, locale)}</span>
                  <small>
                    {entry.featured ? `${t.gachaFeaturedLabel} · ` : ""}
                    {t.gachaRarityLabels[entry.rarity]}
                  </small>
                </li>
              ))}
            </ul>
          </div>

          <details className={styles.odds}>
            <summary>{t.gachaOddsHeading}</summary>
            <ul>
              {gachaRarities.map((rarity) => (
                <li key={rarity}>
                  <span>{t.gachaRarityLabels[rarity]}</span>
                  <strong>{document.rates[rateKey[rarity]]}%</strong>
                </li>
              ))}
            </ul>
            {document.pityEnabled ? (
              <p>{t.gachaGuaranteeRule(document.guaranteedAt, rarityLabel)}</p>
            ) : null}
          </details>

          <div className={styles.drawArea}>
            {result ? (
              <div
                className={styles.result}
                key={result.sequence}
                data-rarity={result.reward.rarity}
                role="status"
                aria-live="polite"
                aria-label={t.gachaResultAnnouncement(
                  entryName(result.reward, locale),
                  t.gachaRarityLabels[result.reward.rarity],
                )}
              >
                <span>{t.gachaResultHeading}</span>
                <strong>{entryName(result.reward, locale)}</strong>
                <small>
                  {t.gachaRarityLabels[result.reward.rarity]}
                  {result.guaranteeApplied
                    ? ` · ${t.gachaGuaranteeApplied}`
                    : ""}
                </small>
              </div>
            ) : (
              <div className={styles.readyState} aria-live="polite">
                <strong>{schedule}</strong>
                <span>
                  {availability === "live" && document.pityEnabled
                    ? t.gachaGuaranteeProgress(remaining, rarityLabel)
                    : availability !== "live"
                      ? t.gachaNoLiveBanner
                      : t.gachaFreeLabel}
                </span>
              </div>
            )}
            <button
              type="button"
              className={styles.revealButton}
              onClick={reveal}
              disabled={!hydrated || availability !== "live"}
            >
              {result ? t.gachaRevealAgain : t.gachaRevealButton}
            </button>
          </div>

          <p className={styles.contract}>{t.gachaDigitalOnly}</p>
        </div>
      </div>
    </section>
  );
}
