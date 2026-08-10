"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FaceboothCanvasBoundary } from "@/components/facebooth/facebooth-canvas-boundary";
import { FaceboothStandeeStage } from "@/components/facebooth/standee-model";
import { traceFaceboothArtwork } from "@/components/facebooth/trace-artwork";
import {
  saveFaceboothProjectAction,
  verifyFaceboothUploadAction,
} from "@/app/manage/[boothId]/facebooth/actions";
import {
  acrylicStandeeDocumentSchema,
  FACEBOOTH_ASSET_MAX_BYTES,
  type AcrylicStandeeDocument,
} from "@/lib/facebooth-documents";
import { resizeStandeePreservingAspect } from "@/lib/facebooth-geometry";
import type { FaceboothStrings } from "@/lib/i18n/facebooth";
import type { Locale } from "@/lib/i18n";
import {
  faceboothBackgroundModes,
  type FaceboothBackgroundMode,
  type FaceboothCameraPreset,
} from "@/lib/facebooth-rendering";
import styles from "./standee-editor.module.css";

type EditorProject = {
  id: string;
  name: string;
  editVersion: number;
  document: AcrylicStandeeDocument;
};

type PresignResponse = {
  objectKey?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  error?: string;
};
type SaveState = "SAVED" | "DIRTY" | "SAVING" | "ERROR" | "CONFLICT";
const acceptedArtworkTypes = ["image/jpeg", "image/png", "image/webp"] as const;

function NumberField({
  id,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <span className={styles.numberControl}>
        <input
          id={id}
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step="1"
          type="number"
          value={value}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

export function StandeeEditor({
  boothId,
  locale,
  initialProject,
  initialArtworkUrl,
  strings,
}: {
  boothId: string;
  locale: Locale;
  initialProject: EditorProject;
  initialArtworkUrl: string | null;
  strings: FaceboothStrings;
}) {
  const [document, setDocument] = useState(initialProject.document);
  const [name, setName] = useState(initialProject.name);
  const [editVersion, setEditVersion] = useState(initialProject.editVersion);
  const [artworkUrl, setArtworkUrl] = useState(initialArtworkUrl);
  const [fillGaps, setFillGaps] = useState(true);
  const [cameraPreset, setCameraPreset] =
    useState<FaceboothCameraPreset>("THREE_QUARTER");
  const [background, setBackground] =
    useState<FaceboothBackgroundMode>("STUDIO");
  const [turntable, setTurntable] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("SAVED");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(
    () => () => {
      if (artworkUrl?.startsWith("blob:")) URL.revokeObjectURL(artworkUrl);
    },
    [artworkUrl],
  );

  const statusLabel =
    saveState === "SAVING"
      ? strings.saving
      : saveState === "SAVED"
        ? strings.saved
        : saveState === "CONFLICT"
          ? strings.conflict
          : saveState === "ERROR"
            ? message || strings.uploadError
            : strings.unsaved;
  const updateDocument = (
    updater: (current: AcrylicStandeeDocument) => AcrylicStandeeDocument,
  ) => {
    setDocument((current) => updater(current));
    setSaveState("DIRTY");
    setMessage("");
  };
  const updateParsed = (candidate: AcrylicStandeeDocument) => {
    const parsed = acrylicStandeeDocumentSchema.safeParse(candidate);
    if (parsed.success) updateDocument(() => parsed.data);
  };

  async function uploadArtwork(file: File | undefined) {
    if (
      !file ||
      !acceptedArtworkTypes.includes(
        file.type as (typeof acceptedArtworkTypes)[number],
      ) ||
      file.size > FACEBOOTH_ASSET_MAX_BYTES
    ) {
      setSaveState("ERROR");
      setMessage(strings.invalidFile);
      return;
    }
    setSaveState("SAVING");
    setMessage(strings.tracing);
    try {
      const traced = await traceFaceboothArtwork(file, fillGaps);
      const presignResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boothId,
          purpose: "facebooth-artwork",
          contentType: file.type,
          contentLength: file.size,
        }),
      });
      const presign = (await presignResponse.json()) as PresignResponse;
      if (!presignResponse.ok || !presign.uploadUrl || !presign.objectKey)
        throw new Error(presign.error || strings.uploadError);
      const uploaded = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: presign.headers,
        body: file,
      });
      if (!uploaded.ok) throw new Error(strings.uploadError);
      const verification = await verifyFaceboothUploadAction(
        boothId,
        "artwork",
        presign.objectKey,
      );
      if (verification.kind !== "verified")
        throw new Error(strings.uploadError);
      const next = resizeStandeePreservingAspect(
        {
          ...document,
          artwork: {
            objectKey: presign.objectKey,
            contentType: file.type as (typeof acceptedArtworkTypes)[number],
            pixelWidth: traced.pixelWidth,
            pixelHeight: traced.pixelHeight,
            contourPoints: traced.points,
            opaqueFallback: traced.opaqueFallback,
          },
        },
        "height",
        document.sizeMm.height,
      );
      const nextUrl = URL.createObjectURL(file);
      setArtworkUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return nextUrl;
      });
      setDocument(next);
      setSaveState("DIRTY");
      setMessage("");
    } catch (error) {
      setSaveState("ERROR");
      setMessage(error instanceof Error ? error.message : strings.uploadError);
    }
  }

  function saveProject() {
    setSaveState("SAVING");
    setMessage("");
    startTransition(async () => {
      const result = await saveFaceboothProjectAction(
        boothId,
        initialProject.id,
        {
          expectedEditVersion: editVersion,
          name,
          document,
        },
      );
      if (result.kind === "saved") {
        setEditVersion(result.project.editVersion);
        setDocument(result.project.document as AcrylicStandeeDocument);
        setSaveState("SAVED");
      } else if (result.kind === "conflict") {
        setSaveState("CONFLICT");
      } else {
        setSaveState("ERROR");
        setMessage(strings.uploadError);
      }
    });
  }

  const fallback = useMemo(
    () => (
      <div className={styles.canvasFallback} role="status">
        <strong>{strings.webglUnavailable}</strong>
        <p>{strings.webglFallback}</p>
      </div>
    ),
    [strings],
  );

  return (
    <div className={styles.page} lang={locale}>
      <header className={styles.editorHeader}>
        <div>
          <Link href={`/manage/${boothId}/facebooth`}>
            ← {strings.backToLibrary}
          </Link>
          <p>{strings.editorEyebrow}</p>
          <input
            aria-label={strings.projectName}
            className={styles.projectName}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
              setSaveState("DIRTY");
            }}
            value={name}
          />
          <span>{strings.editorDescription}</span>
        </div>
        <div className={styles.saveCluster}>
          <span aria-live="polite" data-state={saveState}>
            {statusLabel}
          </span>
          <button
            disabled={
              isPending ||
              saveState === "SAVED" ||
              saveState === "CONFLICT" ||
              !name.trim()
            }
            onClick={saveProject}
            type="button"
          >
            {isPending ? strings.saving : strings.save}
          </button>
        </div>
      </header>

      <div className={styles.workbench}>
        <section
          className={styles.previewPanel}
          aria-labelledby="standee-preview-heading"
        >
          <div className={styles.panelHeading}>
            <h2 id="standee-preview-heading">{strings.previewHeading}</h2>
            <span>
              {document.sizeMm.width} × {document.sizeMm.height} ×{" "}
              {document.sizeMm.thickness} {strings.millimetres}
            </span>
          </div>
          <div className={styles.canvasWrap}>
            <FaceboothCanvasBoundary fallback={fallback}>
              <FaceboothStandeeStage
                artworkUrl={artworkUrl}
                background={background}
                cameraPreset={cameraPreset}
                document={document}
                turntable={turntable}
              />
            </FaceboothCanvasBoundary>
          </div>
          <div className={styles.previewControls} aria-label={strings.camera}>
            {(["FRONT", "THREE_QUARTER", "SIDE", "TOP"] as const).map(
              (preset) => (
                <button
                  aria-pressed={cameraPreset === preset}
                  key={preset}
                  onClick={() => setCameraPreset(preset)}
                  type="button"
                >
                  {preset === "FRONT"
                    ? strings.frontCamera
                    : preset === "THREE_QUARTER"
                      ? strings.angleCamera
                      : preset === "SIDE"
                        ? strings.sideCamera
                        : strings.topCamera}
                </button>
              ),
            )}
            <button
              aria-pressed={turntable}
              onClick={() => setTurntable((current) => !current)}
              type="button"
            >
              {strings.turntable}
            </button>
          </div>
        </section>

        <aside
          className={styles.inspector}
          aria-labelledby="standee-inspector-heading"
        >
          <h2 id="standee-inspector-heading">{strings.inspectorHeading}</h2>
          <fieldset>
            <legend>{strings.artwork}</legend>
            <p>{strings.artworkHelp}</p>
            <label className={styles.uploadButton}>
              <span>
                {saveState === "SAVING" && message === strings.tracing
                  ? strings.tracing
                  : strings.uploadArtwork}
              </span>
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={saveState === "SAVING"}
                onChange={(event) =>
                  void uploadArtwork(event.target.files?.[0])
                }
                type="file"
              />
            </label>
            <label className={styles.checkField}>
              <input
                checked={fillGaps}
                onChange={(event) => setFillGaps(event.target.checked)}
                type="checkbox"
              />
              <span>{strings.fillGaps}</span>
            </label>
            {document.artwork.objectKey ? (
              <small className={styles.artworkStatus}>
                {document.artwork.opaqueFallback
                  ? strings.presetOutline
                  : strings.tracedOutline}
              </small>
            ) : null}
          </fieldset>

          <fieldset className={styles.fieldGrid}>
            <legend>
              {strings.width} / {strings.height}
            </legend>
            <NumberField
              id="standee-width"
              label={strings.width}
              max={2000}
              min={20}
              onChange={(value) =>
                updateDocument((current) =>
                  resizeStandeePreservingAspect(current, "width", value),
                )
              }
              unit={strings.millimetres}
              value={document.sizeMm.width}
            />
            <NumberField
              id="standee-height"
              label={strings.height}
              max={2000}
              min={20}
              onChange={(value) =>
                updateDocument((current) =>
                  resizeStandeePreservingAspect(current, "height", value),
                )
              }
              unit={strings.millimetres}
              value={document.sizeMm.height}
            />
            <SelectField
              id="standee-thickness"
              label={strings.thickness}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  sizeMm: {
                    ...document.sizeMm,
                    thickness: Number(value) as 2 | 3 | 5,
                  },
                })
              }
              value={String(document.sizeMm.thickness)}
            >
              <option value="2">2 mm</option>
              <option value="3">3 mm</option>
              <option value="5">5 mm</option>
            </SelectField>
            <NumberField
              id="standee-border"
              label={strings.border}
              max={100}
              min={0}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  print: { ...document.print, borderMm: value },
                })
              }
              unit={strings.millimetres}
              value={document.print.borderMm}
            />
          </fieldset>

          <fieldset className={styles.fieldGrid}>
            <legend>{strings.finish}</legend>
            <SelectField
              id="standee-finish"
              label={strings.finish}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  material: {
                    finish:
                      value as AcrylicStandeeDocument["material"]["finish"],
                    tintHex:
                      value === "TINTED"
                        ? (document.material.tintHex ?? "#65a999")
                        : document.material.tintHex,
                  },
                })
              }
              value={document.material.finish}
            >
              <option value="CLEAR">{strings.clear}</option>
              <option value="FROSTED">{strings.frosted}</option>
              <option value="TINTED">{strings.tinted}</option>
              <option value="IRIDESCENT">{strings.iridescent}</option>
            </SelectField>
            {document.material.finish === "TINTED" ? (
              <label className={styles.field} htmlFor="standee-tint">
                <span>{strings.tint}</span>
                <input
                  id="standee-tint"
                  onChange={(event) =>
                    updateParsed({
                      ...document,
                      material: {
                        ...document.material,
                        tintHex: event.target.value,
                      },
                    })
                  }
                  type="color"
                  value={document.material.tintHex ?? "#65a999"}
                />
              </label>
            ) : null}
            <SelectField
              id="standee-print"
              label={strings.printSides}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  print: {
                    ...document.print,
                    sides: value as AcrylicStandeeDocument["print"]["sides"],
                  },
                })
              }
              value={document.print.sides}
            >
              <option value="FRONT">{strings.front}</option>
              <option value="TWO_SIDED">{strings.twoSided}</option>
            </SelectField>
          </fieldset>

          <fieldset className={styles.fieldGrid}>
            <legend>{strings.base}</legend>
            <label className={styles.checkField}>
              <input
                checked={document.base.enabled}
                onChange={(event) =>
                  updateParsed({
                    ...document,
                    base: { ...document.base, enabled: event.target.checked },
                  })
                }
                type="checkbox"
              />
              <span>{strings.baseEnabled}</span>
            </label>
            <NumberField
              id="base-width"
              label={strings.baseWidth}
              max={2000}
              min={20}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  base: { ...document.base, widthMm: value },
                })
              }
              unit={strings.millimetres}
              value={document.base.widthMm}
            />
            <NumberField
              id="base-depth"
              label={strings.baseDepth}
              max={1000}
              min={10}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  base: { ...document.base, depthMm: value },
                })
              }
              unit={strings.millimetres}
              value={document.base.depthMm}
            />
            <NumberField
              id="base-thickness"
              label={strings.baseThickness}
              max={100}
              min={2}
              onChange={(value) =>
                updateParsed({
                  ...document,
                  base: { ...document.base, thicknessMm: value },
                })
              }
              unit={strings.millimetres}
              value={document.base.thicknessMm}
            />
          </fieldset>

          <fieldset>
            <legend>{strings.scene}</legend>
            <div className={styles.segmented}>
              {faceboothBackgroundModes.map((mode) => (
                <button
                  aria-pressed={background === mode}
                  key={mode}
                  onClick={() => setBackground(mode)}
                  type="button"
                >
                  {mode === "STUDIO"
                    ? strings.studio
                    : mode === "SOLID"
                      ? strings.solid
                      : mode === "GRADIENT"
                        ? strings.gradient
                        : strings.transparent}
                </button>
              ))}
            </div>
          </fieldset>
        </aside>
      </div>
    </div>
  );
}
