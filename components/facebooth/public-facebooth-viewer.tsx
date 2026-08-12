"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DocumentLocale } from "@/components/i18n/document-locale";
import type { SceneCameraPreset } from "@/components/facebooth/scene-model";
import type {
  AcrylicStandeeDocument,
  FaceboothSceneDocument,
} from "@/lib/facebooth-documents";
import { getPublicFaceboothStrings } from "@/lib/i18n/facebooth-public";
import type { Locale } from "@/lib/i18n";
import styles from "./public-facebooth-viewer.module.css";

const LazyPublicFaceboothWebgl = dynamic(
  () =>
    import("@/components/facebooth/public-facebooth-webgl").then(
      ({ PublicFaceboothWebgl }) => PublicFaceboothWebgl,
    ),
  { ssr: false },
);

export type PublicFaceboothMerch = {
  projectId: string;
  name: string;
  artworkUrl: string | null;
  document: AcrylicStandeeDocument;
};

function ViewerFallback({
  previewUrl,
  title,
  description,
}: {
  previewUrl: string | null;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.fallback}>
      {previewUrl ? (
        <Image
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 100vw, 72vw"
          src={previewUrl}
          unoptimized
        />
      ) : (
        <div className={styles.fallbackArt} aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
      )}
      <div className={styles.fallbackCopy}>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  );
}

export function PublicFaceboothViewer({
  artworkUrls,
  boothSlug,
  locale,
  merch,
  previewUrl,
  revision,
  scene,
  sceneName,
}: {
  artworkUrls: Record<string, string | null>;
  boothSlug: string;
  locale: Locale;
  merch: PublicFaceboothMerch[];
  previewUrl: string | null;
  revision: number;
  scene: FaceboothSceneDocument;
  sceneName: string;
}) {
  const strings = getPublicFaceboothStrings(locale);
  const [cameraPreset, setCameraPreset] =
    useState<SceneCameraPreset>("THREE_QUARTER");
  const fallback = (
    <ViewerFallback
      description={strings.fallbackDescription}
      previewUrl={previewUrl}
      title={strings.fallbackTitle}
    />
  );

  return (
    <main className={styles.page} lang={locale}>
      <DocumentLocale locale={locale} />
      <header className={styles.hero}>
        <div>
          <Link href={`/s/${encodeURIComponent(boothSlug)}`}>
            ← {strings.backToBooth}
          </Link>
          <p>{strings.pageEyebrow}</p>
          <h1>{sceneName}</h1>
        </div>
        <div className={styles.snapshotMeta}>
          <span>{strings.snapshotNote(revision)}</span>
          <strong>{strings.displayOnly}</strong>
        </div>
      </header>

      <section className={styles.viewerSection} aria-label={sceneName}>
        <div className={styles.viewerToolbar}>
          <div>
            <span>{strings.dimensions}</span>
            <strong>
              {scene.footprintMm.width} × {scene.footprintMm.depth} ×{" "}
              {scene.footprintMm.height} {strings.millimetres}
            </strong>
          </div>
          <fieldset>
            <legend>{strings.camera}</legend>
            {(
              [
                ["FRONT", strings.frontView],
                ["THREE_QUARTER", strings.angleView],
                ["TOP", strings.topView],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={cameraPreset === value}
                key={value}
                onClick={() => setCameraPreset(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </fieldset>
          <p>{strings.interaction}</p>
        </div>
        <div className={styles.canvasFrame}>
          <div aria-hidden="true" className={styles.fallbackUnderlay}>
            {fallback}
          </div>
          <LazyPublicFaceboothWebgl
            artworkUrls={artworkUrls}
            cameraPreset={cameraPreset}
            canvasLabel={`${sceneName} — ${strings.displayOnly}`}
            document={scene}
            fallback={fallback}
          />
        </div>
      </section>

      <section
        className={styles.merchSection}
        aria-labelledby="facebooth-public-merch"
      >
        <header>
          <p>{strings.pageEyebrow}</p>
          <h2 id="facebooth-public-merch">{strings.merchHeading}</h2>
          <span>{strings.merchDescription}</span>
        </header>
        {merch.length ? (
          <div className={styles.merchGrid}>
            {merch.map((item) => (
              <article key={item.projectId}>
                <div className={styles.merchArt}>
                  {item.artworkUrl ? (
                    <Image
                      alt=""
                      fill
                      sizes="(max-width: 620px) 100vw, 33vw"
                      src={item.artworkUrl}
                      unoptimized
                    />
                  ) : (
                    <span>{strings.artworkFallback}</span>
                  )}
                </div>
                <div className={styles.merchCopy}>
                  <h3>{item.name}</h3>
                  <span>{strings.standeeDimensions}</span>
                  <strong>
                    {item.document.sizeMm.width} × {item.document.sizeMm.height}{" "}
                    {strings.millimetres}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.merchEmpty}>{strings.merchEmpty}</p>
        )}
      </section>
    </main>
  );
}
