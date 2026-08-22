"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  publishFaceboothSnapshotAction,
  unpublishFaceboothSnapshotAction,
} from "@/app/manage/[boothId]/facebooth/actions";
import type { FaceboothLibraryProject } from "@/components/facebooth/facebooth-library";
import type { FaceboothStrings } from "@/lib/i18n/facebooth";
import type { Locale } from "@/lib/i18n";
import styles from "./facebooth-publication-panel.module.css";

export type FaceboothManagerPublication = {
  revision: number;
  publishedAt: string;
  sceneProjectId: string;
  merchProjectIds: string[];
} | null;

export function FaceboothPublicationPanel({
  boothId,
  initialPublication,
  locale,
  projects,
  strings,
}: {
  boothId: string;
  initialPublication: FaceboothManagerPublication;
  locale: Locale;
  projects: FaceboothLibraryProject[];
  strings: FaceboothStrings;
}) {
  const router = useRouter();
  const scenes = projects.filter(({ kind }) => kind === "SCENE");
  const merch = projects.filter(({ kind }) => kind === "MERCH");
  const [publication, setPublication] =
    useState<FaceboothManagerPublication>(initialPublication);
  const [sceneProjectId, setSceneProjectId] = useState(
    initialPublication?.sceneProjectId ?? scenes[0]?.id ?? "",
  );
  const [merchProjectIds, setMerchProjectIds] = useState(
    initialPublication?.merchProjectIds.filter((projectId) =>
      merch.some(({ id }) => id === projectId),
    ) ?? [],
  );
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const toggleMerch = (projectId: string) => {
    setMerchProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : current.length < 6
          ? [...current, projectId]
          : current,
    );
  };

  const publish = () => {
    if (!sceneProjectId) return;
    setMessage("");
    startTransition(async () => {
      const result = await publishFaceboothSnapshotAction(boothId, {
        sceneProjectId,
        merchProjectIds,
      });
      if (result.kind !== "published") {
        setMessage(strings.publicationFailed);
        return;
      }
      setPublication({
        revision: result.publication.revision,
        publishedAt: result.publication.publishedAt,
        sceneProjectId: result.publication.document.scene.projectId,
        merchProjectIds: result.publication.document.merch.map(
          ({ projectId }) => projectId,
        ),
      });
      setConfirmUnpublish(false);
      setMessage(strings.publicationSaved);
      router.refresh();
    });
  };

  const unpublish = () => {
    setMessage("");
    startTransition(async () => {
      const result = await unpublishFaceboothSnapshotAction(boothId);
      if (result.kind !== "unpublished" && result.kind !== "missing") {
        setMessage(strings.publicationFailed);
        return;
      }
      setPublication(null);
      setConfirmUnpublish(false);
      setMessage(strings.publicationRemoved);
      router.refresh();
    });
  };

  return (
    <section
      className={styles.panel}
      aria-labelledby="facebooth-publication-heading"
    >
      <header className={styles.heading}>
        <div>
          <p>{strings.publicationHeading}</p>
          <h2 id="facebooth-publication-heading">
            {publication
              ? `${strings.publicationLiveStatus} ${publication.revision}`
              : strings.publicationDraftStatus}
          </h2>
          <span>{strings.publicationDescription}</span>
        </div>
        {publication ? (
          <time dateTime={publication.publishedAt}>
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date(publication.publishedAt))}
          </time>
        ) : null}
      </header>

      <div className={styles.selections}>
        <fieldset>
          <legend>{strings.publicationScene}</legend>
          {scenes.length ? (
            <div className={styles.optionGrid}>
              {scenes.map((project) => (
                <label key={project.id}>
                  <input
                    checked={sceneProjectId === project.id}
                    name="facebooth-publication-scene"
                    onChange={() => setSceneProjectId(project.id)}
                    type="radio"
                    value={project.id}
                  />
                  <span>{project.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{strings.publicationNoScene}</p>
          )}
        </fieldset>

        <fieldset>
          <legend>{strings.publicationMerch}</legend>
          <p className={styles.limit}>
            {strings.publicationMerchLimit} · {merchProjectIds.length}/6
          </p>
          <div className={styles.optionGrid}>
            {merch.map((project) => {
              const checked = merchProjectIds.includes(project.id);
              return (
                <label key={project.id}>
                  <input
                    checked={checked}
                    disabled={!checked && merchProjectIds.length >= 6}
                    onChange={() => toggleMerch(project.id)}
                    type="checkbox"
                    value={project.id}
                  />
                  <span>{project.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <footer className={styles.actions}>
        <button
          disabled={isPending || !sceneProjectId}
          onClick={publish}
          type="button"
        >
          {isPending
            ? strings.publishingShowcase
            : publication
              ? strings.republishShowcase
              : strings.publishShowcase}
        </button>
        {publication ? (
          confirmUnpublish ? (
            <div className={styles.confirm} role="alert">
              <span>{strings.publicationUnpublishConfirm}</span>
              <button disabled={isPending} onClick={unpublish} type="button">
                {isPending
                  ? strings.unpublishingShowcase
                  : strings.unpublishShowcase}
              </button>
              <button
                disabled={isPending}
                onClick={() => setConfirmUnpublish(false)}
                type="button"
              >
                {strings.cancel}
              </button>
            </div>
          ) : (
            <button
              className={styles.unpublish}
              onClick={() => setConfirmUnpublish(true)}
              type="button"
            >
              {strings.unpublishShowcase}
            </button>
          )
        ) : null}
        <p aria-live="polite">{message}</p>
      </footer>
    </section>
  );
}
