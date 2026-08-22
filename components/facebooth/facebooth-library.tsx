"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createFaceboothProjectAction,
  deleteFaceboothProjectAction,
  duplicateFaceboothProjectAction,
  importFaceboothProjectAction,
  renameFaceboothProjectAction,
  verifyFaceboothUploadAction,
} from "@/app/manage/[boothId]/facebooth/actions";
import {
  createDefaultAcrylicStandeeDocument,
  createDefaultFaceboothSceneDocument,
  type FaceboothProjectDocument,
  type FaceboothProjectKind,
} from "@/lib/facebooth-documents";
import {
  createFaceboothExportPackage,
  downloadFaceboothFile,
  faceboothFileStem,
  FaceboothPortableError,
  parseFaceboothExportFile,
  replaceFaceboothArtworkObjectKeys,
} from "@/lib/facebooth-portable";
import {
  FaceboothPublicationPanel,
  type FaceboothManagerPublication,
} from "@/components/facebooth/facebooth-publication-panel";
import type { Locale } from "@/lib/i18n";
import { getFaceboothStrings } from "@/lib/i18n/facebooth";
import styles from "./facebooth-library.module.css";

export type FaceboothLibraryProject = {
  id: string;
  kind: FaceboothProjectKind;
  editVersion: number;
  name: string;
  document: FaceboothProjectDocument;
  previewUrl: string | null;
  assetUrls: Record<string, string>;
  updatedAt: string;
};

type PresignResponse = {
  objectKey?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  error?: string;
};

function ProjectPreview({ project }: { project: FaceboothLibraryProject }) {
  if (project.previewUrl) {
    return (
      <Image
        alt=""
        className={styles.previewImage}
        fill
        sizes="(max-width: 700px) 100vw, 320px"
        src={project.previewUrl}
        unoptimized
      />
    );
  }
  return (
    <div className={styles.previewFallback} aria-hidden="true">
      <span>{project.kind === "MERCH" ? "ACRYLIC" : "LAYOUT"}</span>
      <strong>
        {project.document.kind === "MERCH"
          ? `${project.document.sizeMm.width} × ${project.document.sizeMm.height} mm`
          : `${project.document.footprintMm.width} × ${project.document.footprintMm.depth} mm`}
      </strong>
    </div>
  );
}

export function FaceboothLibrary({
  boothId,
  initialPublication,
  locale,
  projects,
}: {
  boothId: string;
  initialPublication: FaceboothManagerPublication;
  locale: Locale;
  projects: FaceboothLibraryProject[];
}) {
  const strings = getFaceboothStrings(locale);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const merchProjects = projects.filter(({ kind }) => kind === "MERCH");
  const sceneProjects = projects.filter(({ kind }) => kind === "SCENE");

  const projectCount = (count: number) =>
    `${count} ${count === 1 ? strings.projectSingular : strings.projectPlural}`;

  const run = (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setMessage("");
    startTransition(async () => {
      try {
        await action();
      } finally {
        setBusyId(null);
      }
    });
  };

  const createProject = (kind: FaceboothProjectKind) =>
    run(`create-${kind}`, async () => {
      const result = await createFaceboothProjectAction(boothId, {
        name: kind === "MERCH" ? strings.newStandee : strings.newScene,
        kind,
        document:
          kind === "MERCH"
            ? createDefaultAcrylicStandeeDocument()
            : createDefaultFaceboothSceneDocument(),
      });
      if (result.kind === "created") {
        router.push(`/manage/${boothId}/facebooth/${result.project.id}`);
      } else {
        setMessage(
          result.kind === "quota"
            ? strings.projectQuota(result.limit)
            : strings.importFailed,
        );
      }
    });

  const renameProject = (project: FaceboothLibraryProject) =>
    run(project.id, async () => {
      const result = await renameFaceboothProjectAction(boothId, project.id, {
        expectedEditVersion: project.editVersion,
        name: renameValue,
      });
      if (result.kind === "renamed") {
        setRenamingId(null);
        router.refresh();
      } else setMessage(strings.importFailed);
    });

  const duplicateProject = (project: FaceboothLibraryProject) =>
    run(project.id, async () => {
      const result = await duplicateFaceboothProjectAction(
        boothId,
        project.id,
        `${project.name} ${strings.copySuffix}`.slice(0, 120),
      );
      if (result.kind === "duplicated") router.refresh();
      else {
        setMessage(
          result.kind === "quota"
            ? strings.projectQuota(result.limit)
            : strings.importFailed,
        );
      }
    });

  const deleteProject = (project: FaceboothLibraryProject) =>
    run(project.id, async () => {
      const result = await deleteFaceboothProjectAction(boothId, project.id);
      if (result.kind === "deleted") {
        setDeleteId(null);
        router.refresh();
      } else if (result.kind === "in-use") setMessage(strings.deleteInUse);
      else setMessage(strings.importFailed);
    });

  const exportProject = (project: FaceboothLibraryProject) =>
    run(project.id, async () => {
      try {
        const projectPackage = await createFaceboothExportPackage({
          name: project.name,
          kind: project.kind,
          document: project.document,
          assetUrls: project.assetUrls,
        });
        downloadFaceboothFile(
          JSON.stringify(projectPackage),
          `${faceboothFileStem(project.name)}.facebooth.json`,
          "application/json",
        );
      } catch {
        setMessage(strings.importFailed);
      }
    });

  async function uploadImportedAsset(
    bytes: Uint8Array,
    contentType: "image/jpeg" | "image/png" | "image/webp",
  ) {
    const response = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boothId,
        purpose: "facebooth-artwork",
        contentType,
        contentLength: bytes.byteLength,
      }),
    });
    const presign = (await response.json()) as PresignResponse;
    if (!response.ok || !presign.uploadUrl || !presign.objectKey) {
      throw new Error(presign.error || strings.importFailed);
    }
    const upload = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: presign.headers,
      body: new Blob([bytes.slice().buffer], { type: contentType }),
    });
    if (!upload.ok) throw new Error(strings.importFailed);
    const verification = await verifyFaceboothUploadAction(
      boothId,
      "artwork",
      presign.objectKey,
    );
    if (verification.kind !== "verified") throw new Error(strings.importFailed);
    return presign.objectKey;
  }

  const importProject = (file: File | undefined) => {
    if (!file) return;
    run("import", async () => {
      try {
        const parsed = await parseFaceboothExportFile(file);
        const objectKeys = new Map<string, string>();
        for (const asset of parsed.package.assets) {
          const bytes = parsed.decodedAssets.get(asset.sourceObjectKey);
          if (!bytes) throw new Error(strings.importFailed);
          objectKeys.set(
            asset.sourceObjectKey,
            await uploadImportedAsset(bytes, asset.contentType),
          );
        }
        const document = replaceFaceboothArtworkObjectKeys(
          parsed.package.project.document,
          objectKeys,
        );
        const result = await importFaceboothProjectAction(boothId, {
          ...parsed.package.project,
          document,
        });
        if (result.kind !== "imported") {
          throw new Error(
            result.kind === "quota"
              ? strings.projectQuota(result.limit)
              : strings.importFailed,
          );
        }
        router.push(`/manage/${boothId}/facebooth/${result.project.id}`);
      } catch (error) {
        setMessage(
          error instanceof FaceboothPortableError &&
            error.code === "UNSUPPORTED_VERSION"
            ? strings.importUnsupported
            : error instanceof FaceboothPortableError
              ? strings.importInvalid
              : error instanceof Error
                ? error.message
                : strings.importFailed,
        );
      }
    });
  };

  const group = (
    id: string,
    title: string,
    items: FaceboothLibraryProject[],
    emptyTitle: string,
    emptyDescription: string,
  ) => (
    <section className={styles.projectGroup} aria-labelledby={id}>
      <header>
        <div>
          <h2 id={id}>{title}</h2>
          <span>{projectCount(items.length)}</span>
        </div>
      </header>
      {items.length ? (
        <div className={styles.projectGrid}>
          {items.map((project) => (
            <article className={styles.projectCard} key={project.id}>
              <Link
                aria-label={`${strings.openProject}: ${project.name}`}
                className={styles.preview}
                href={`/manage/${boothId}/facebooth/${project.id}`}
              >
                <ProjectPreview project={project} />
              </Link>
              <div className={styles.projectCopy}>
                {renamingId === project.id ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      renameProject(project);
                    }}
                  >
                    <label>
                      <span>{strings.renameProject}</span>
                      <input
                        autoFocus
                        maxLength={120}
                        onChange={(event) => setRenameValue(event.target.value)}
                        required
                        value={renameValue}
                      />
                    </label>
                    <div>
                      <button disabled={isPending} type="submit">
                        {strings.saveRename}
                      </button>
                      <button onClick={() => setRenamingId(null)} type="button">
                        {strings.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.projectTitle}>
                      <h3>{project.name}</h3>
                      <span>
                        {strings.projectUpdated} ·{" "}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                        }).format(new Date(project.updatedAt))}
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      <Link href={`/manage/${boothId}/facebooth/${project.id}`}>
                        {strings.openProject}
                      </Link>
                      <button
                        onClick={() => {
                          setRenamingId(project.id);
                          setRenameValue(project.name);
                        }}
                        type="button"
                      >
                        {strings.renameProject}
                      </button>
                      <button
                        disabled={busyId === project.id}
                        onClick={() => duplicateProject(project)}
                        type="button"
                      >
                        {strings.duplicateProject}
                      </button>
                      <button
                        disabled={busyId === project.id}
                        onClick={() => exportProject(project)}
                        type="button"
                      >
                        {busyId === project.id
                          ? strings.exporting
                          : strings.exportProject}
                      </button>
                      <button
                        className={styles.deleteButton}
                        onClick={() => setDeleteId(project.id)}
                        type="button"
                      >
                        {strings.deleteProject}
                      </button>
                    </div>
                    {deleteId === project.id ? (
                      <div className={styles.deleteConfirm} role="alert">
                        <span>{strings.deleteConfirm}</span>
                        <button
                          disabled={busyId === project.id}
                          onClick={() => deleteProject(project)}
                          type="button"
                        >
                          {strings.deleteProject}
                        </button>
                        <button onClick={() => setDeleteId(null)} type="button">
                          {strings.cancel}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span aria-hidden="true">+</span>
          <div>
            <h3>{emptyTitle}</h3>
            <p>{emptyDescription}</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className={styles.page} lang={locale}>
      <header className={styles.heading}>
        <div>
          <p>{strings.libraryEyebrow}</p>
          <h1>{strings.libraryTitle}</h1>
          <span>{strings.libraryDescription}</span>
        </div>
        <div className={styles.headingActions}>
          <button
            disabled={isPending}
            onClick={() => createProject("MERCH")}
            type="button"
          >
            {strings.newStandee}
          </button>
          <button
            disabled={isPending}
            onClick={() => createProject("SCENE")}
            type="button"
          >
            {strings.newScene}
          </button>
          <label className={styles.importButton}>
            <span>
              {busyId === "import" ? strings.importing : strings.importProject}
            </span>
            <input
              accept=".json,application/json"
              disabled={isPending}
              onChange={(event) => importProject(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>
      </header>
      <p className={styles.message} aria-live="polite">
        {message}
      </p>
      <FaceboothPublicationPanel
        boothId={boothId}
        initialPublication={initialPublication}
        locale={locale}
        projects={projects}
        strings={strings}
      />
      {group(
        "facebooth-merch-projects",
        strings.merchProjects,
        merchProjects,
        strings.emptyMerchTitle,
        strings.emptyMerchDescription,
      )}
      {group(
        "facebooth-scene-projects",
        strings.sceneProjects,
        sceneProjects,
        strings.emptySceneTitle,
        strings.emptySceneDescription,
      )}
    </div>
  );
}
