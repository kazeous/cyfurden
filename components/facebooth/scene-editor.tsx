"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FaceboothAutosaveControls } from "@/components/facebooth/facebooth-autosave-controls";
import { FaceboothCanvasBoundary } from "@/components/facebooth/facebooth-canvas-boundary";
import { FaceboothExportControls } from "@/components/facebooth/facebooth-export-controls";
import {
  FaceboothPngCaptureBridge,
  type FaceboothPngCapture,
} from "@/components/facebooth/facebooth-png-export";
import {
  FaceboothSceneStage,
  type SceneCameraPreset,
} from "@/components/facebooth/scene-model";
import { useFaceboothAutosave } from "@/components/facebooth/use-facebooth-autosave";
import { useFaceboothThumbnail } from "@/components/facebooth/use-facebooth-thumbnail";
import {
  faceboothSceneDocumentSchema,
  type AcrylicStandeeDocument,
  type FaceboothSceneDocument,
} from "@/lib/facebooth-documents";
import {
  addMerchRevisionSnapshot,
  analyzeFaceboothScene,
  createSceneHistory,
  findSceneSnapshotUpdates,
  getSceneTransform,
  pushSceneHistory,
  redoSceneHistory,
  refreshMerchSnapshot,
  snapSceneSelection,
  snapSelectionToSurface,
  undoSceneHistory,
  updateSceneTransform,
  type SceneSelection,
} from "@/lib/facebooth-scene";
import type { Locale } from "@/lib/i18n";
import type { FaceboothStrings } from "@/lib/i18n/facebooth";
import standeeStyles from "./standee-editor.module.css";
import styles from "./scene-editor.module.css";

type SceneProject = {
  id: string;
  name: string;
  editVersion: number;
  previewObjectKey: string | null;
  document: FaceboothSceneDocument;
};

export type SceneMerchProject = {
  id: string;
  name: string;
  editVersion: number;
  document: AcrylicStandeeDocument;
  artworkUrl: string | null;
};

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const parseSceneDocument = (value: unknown) => {
  const parsed = faceboothSceneDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

function NumericField({
  id,
  label,
  value,
  min,
  max,
  unit = "mm",
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <span>
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

export function SceneEditor({
  boothId,
  locale,
  initialProject,
  merchLibrary,
  initialSnapshotArtworkUrls,
  previewUploadsEnabled,
  strings,
}: {
  boothId: string;
  locale: Locale;
  initialProject: SceneProject;
  merchLibrary: SceneMerchProject[];
  initialSnapshotArtworkUrls: Record<string, string | null>;
  previewUploadsEnabled: boolean;
  strings: FaceboothStrings;
}) {
  const autosave = useFaceboothAutosave({
    boothId,
    kind: "SCENE",
    initialProject,
    parseDocument: parseSceneDocument,
    copyName: (current) => `${current} ${strings.copySuffix}`.slice(0, 120),
  });
  const { document, name, saveState } = autosave;
  const [history, setHistory] = useState(() =>
    createSceneHistory(initialProject.document),
  );
  const [selection, setSelection] = useState<SceneSelection>({
    kind: "TABLE",
    id: "table",
  });
  const [moveMode, setMoveMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [gridMm, setGridMm] = useState(50);
  const [cameraPreset, setCameraPreset] =
    useState<SceneCameraPreset>("THREE_QUARTER");
  const [pngCapture, setPngCapture] = useState<FaceboothPngCapture | null>(
    null,
  );
  const handlePngCaptureReady = useCallback(
    (capture: FaceboothPngCapture | null) => {
      setPngCapture(() => capture);
    },
    [],
  );
  const [captureMode, setCaptureMode] = useState(false);

  useFaceboothThumbnail({
    boothId,
    enabled: previewUploadsEnabled,
    capture: pngCapture,
    fingerprint: JSON.stringify([name, document]),
    hasInitialPreview: Boolean(initialProject.previewObjectKey),
    saveState,
    savePreview: autosave.savePreview,
    prepareCapture: setCaptureMode,
  });

  const warnings = useMemo(() => analyzeFaceboothScene(document), [document]);
  const updateIds = useMemo(
    () => findSceneSnapshotUpdates(document, merchLibrary),
    [document, merchLibrary],
  );
  const selectedTransform = getSceneTransform(document, selection);
  const selectedInstance =
    selection.kind === "INSTANCE"
      ? document.instances.find(({ id }) => id === selection.id)
      : null;
  const selectedBackdrop =
    selection.kind === "BACKDROP"
      ? document.backdrops.find(({ id }) => id === selection.id)
      : null;
  const selectedShelf =
    selection.kind === "SHELF"
      ? document.shelves.find(({ id }) => id === selection.id)
      : null;
  const selectedSnapshot = selectedInstance
    ? document.merchSnapshots.find(
        ({ id }) => id === selectedInstance.merchSnapshotId,
      )
    : null;
  const updateProject = selectedSnapshot
    ? merchLibrary.find(({ id }) => id === selectedSnapshot.sourceProjectId)
    : null;
  const artworkUrls = Object.fromEntries(
    document.merchSnapshots.map((snapshot) => [
      snapshot.id,
      merchLibrary.find(
        ({ id, editVersion }) =>
          id === snapshot.sourceProjectId &&
          editVersion === snapshot.sourceEditVersion,
      )?.artworkUrl ??
        initialSnapshotArtworkUrls[snapshot.id] ??
        null,
    ]),
  );

  const commitDocument = (candidate: FaceboothSceneDocument) => {
    const parsed = faceboothSceneDocumentSchema.safeParse(candidate);
    if (!parsed.success) return;
    autosave.setDocument(parsed.data);
    setHistory((current) => pushSceneHistory(current, parsed.data));
  };

  const updateTransform = (
    updater: (
      transform: NonNullable<typeof selectedTransform>,
    ) => NonNullable<typeof selectedTransform>,
  ) => {
    if (!selectedTransform) return;
    commitDocument(
      updateSceneTransform(document, selection, updater(selectedTransform)),
    );
  };

  const nudge = (axis: "x" | "y" | "z", delta: number) => {
    if (!moveMode) return;
    updateTransform((transform) => ({
      ...transform,
      positionMm: {
        ...transform.positionMm,
        [axis]: Math.max(
          -20_000,
          Math.min(20_000, transform.positionMm[axis] + delta),
        ),
      },
    }));
  };

  const rotate = (delta: number) => {
    if (!moveMode) return;
    updateTransform((transform) => ({
      ...transform,
      rotationMilliDegrees: {
        ...transform.rotationMilliDegrees,
        y:
          ((((transform.rotationMilliDegrees.y + delta + 180_000) % 360_000) +
            360_000) %
            360_000) -
          180_000,
      },
    }));
  };

  const addBackdrop = () => {
    const id = newId("backdrop");
    commitDocument(
      faceboothSceneDocumentSchema.parse({
        ...document,
        backdrops: [
          ...document.backdrops,
          {
            id,
            sizeMm: { width: 2_000, height: 2_000, thickness: 30 },
            finish: "WHITE",
            transform: {
              positionMm: {
                x: 0,
                y: 0,
                z: -document.footprintMm.depth / 2 + 15,
              },
              rotationMilliDegrees: { x: 0, y: 0, z: 0 },
            },
          },
        ],
      }),
    );
    setSelection({ kind: "BACKDROP", id });
  };

  const addShelf = (kind: "SHELF" | "RISER") => {
    const id = newId(kind.toLowerCase());
    commitDocument(
      faceboothSceneDocumentSchema.parse({
        ...document,
        shelves: [
          ...document.shelves,
          {
            id,
            kind,
            sizeMm:
              kind === "SHELF"
                ? { width: 800, depth: 240, height: 40 }
                : { width: 360, depth: 260, height: 100 },
            finish: kind === "SHELF" ? "WOOD_LIGHT" : "CLEAR",
            transform: {
              positionMm: {
                x: 0,
                y: document.table.sizeMm.height,
                z: 0,
              },
              rotationMilliDegrees: { x: 0, y: 0, z: 0 },
            },
          },
        ],
      }),
    );
    setSelection({ kind: "SHELF", id });
  };

  const placeMerch = (project: SceneMerchProject) => {
    const snapshot = addMerchRevisionSnapshot(document, {
      snapshotId: newId("snapshot"),
      projectId: project.id,
      editVersion: project.editVersion,
      name: project.name,
      document: project.document,
    });
    const id = newId("instance");
    commitDocument(
      faceboothSceneDocumentSchema.parse({
        ...snapshot.document,
        instances: [
          ...snapshot.document.instances,
          {
            id,
            merchSnapshotId: snapshot.snapshotId,
            transform: {
              positionMm: {
                x: 0,
                y: document.table.sizeMm.height,
                z: 0,
              },
              rotationMilliDegrees: { x: 0, y: 0, z: 0 },
            },
          },
        ],
      }),
    );
    setSelection({ kind: "INSTANCE", id });
  };

  const duplicateSelection = () => {
    if (selection.kind === "TABLE") return;
    const id = newId(selection.kind.toLowerCase());
    const shift = (transform: NonNullable<typeof selectedTransform>) => ({
      ...transform,
      positionMm: {
        ...transform.positionMm,
        x: transform.positionMm.x + gridMm,
        z: transform.positionMm.z + gridMm,
      },
    });
    if (selection.kind === "BACKDROP") {
      const item = document.backdrops.find(({ id }) => id === selection.id);
      if (item)
        commitDocument({
          ...document,
          backdrops: [
            ...document.backdrops,
            { ...structuredClone(item), id, transform: shift(item.transform) },
          ],
        });
      setSelection({ kind: "BACKDROP", id });
    }
    if (selection.kind === "SHELF") {
      const item = document.shelves.find(({ id }) => id === selection.id);
      if (item)
        commitDocument({
          ...document,
          shelves: [
            ...document.shelves,
            { ...structuredClone(item), id, transform: shift(item.transform) },
          ],
        });
      setSelection({ kind: "SHELF", id });
    }
    if (selection.kind === "INSTANCE") {
      const item = document.instances.find(({ id }) => id === selection.id);
      if (item)
        commitDocument({
          ...document,
          instances: [
            ...document.instances,
            { ...structuredClone(item), id, transform: shift(item.transform) },
          ],
        });
      setSelection({ kind: "INSTANCE", id });
    }
  };

  const deleteSelection = () => {
    if (selection.kind === "TABLE") return;
    commitDocument({
      ...document,
      backdrops:
        selection.kind === "BACKDROP"
          ? document.backdrops.filter(({ id }) => id !== selection.id)
          : document.backdrops,
      shelves:
        selection.kind === "SHELF"
          ? document.shelves.filter(({ id }) => id !== selection.id)
          : document.shelves,
      instances:
        selection.kind === "INSTANCE"
          ? document.instances.filter(({ id }) => id !== selection.id)
          : document.instances,
    });
    setSelection({ kind: "TABLE", id: "table" });
  };

  const undo = () => {
    const result = undoSceneHistory(history);
    setHistory(result.history);
    autosave.setDocument(result.document);
    setSelection({ kind: "TABLE", id: "table" });
  };
  const redo = () => {
    const result = redoSceneHistory(history);
    setHistory(result.history);
    autosave.setDocument(result.document);
    setSelection({ kind: "TABLE", id: "table" });
  };

  const selectionLabel =
    selection.kind === "TABLE"
      ? strings.tableLabel
      : selection.kind === "BACKDROP"
        ? strings.backdropLabel
        : selection.kind === "SHELF"
          ? document.shelves.find(({ id }) => id === selection.id)?.kind ===
            "RISER"
            ? strings.riserLabel
            : strings.shelfLabel
          : (selectedSnapshot?.name ?? strings.standeeLabel);

  const fallback = (
    <div className={standeeStyles.canvasFallback} role="status">
      <strong>{strings.webglUnavailable}</strong>
      <p>{strings.webglFallback}</p>
    </div>
  );

  return (
    <div
      className={`${standeeStyles.page} ${styles.studioPage}`}
      data-facebooth-studio
      lang={locale}
    >
      <header
        className={`${standeeStyles.editorHeader} ${styles.studioHeader}`}
      >
        <div>
          <Link href={`/manage/${boothId}/facebooth`}>
            ← {strings.backToLibrary}
          </Link>
          <p>{strings.sceneEyebrow}</p>
          <input
            aria-label={strings.projectName}
            className={standeeStyles.projectName}
            maxLength={120}
            onChange={(event) => autosave.setName(event.target.value)}
            value={name}
          />
          <span>{strings.sceneDescription}</span>
        </div>
        <div className={styles.studioSave}>
          <FaceboothAutosaveControls
            disabled={!name.trim()}
            onDiscardDraft={() => void autosave.discardRecoveryDraft()}
            onDuplicateVersion={() => void autosave.duplicateMyVersion()}
            onReloadRemote={() => void autosave.reloadRemote()}
            onRestoreDraft={() => {
              if (autosave.recoveryDraft) {
                const parsed = parseSceneDocument(
                  autosave.recoveryDraft.document,
                );
                if (parsed) setHistory(createSceneHistory(parsed));
              }
              autosave.restoreRecoveryDraft();
            }}
            onSaveNow={() => void autosave.saveNow()}
            recoveryDraft={autosave.recoveryDraft}
            saveState={saveState}
            strings={strings}
          />
        </div>
      </header>

      <div className={styles.historyBar}>
        <button disabled={history.index === 0} onClick={undo} type="button">
          ↶ {strings.undo}
        </button>
        <button
          disabled={history.index === history.entries.length - 1}
          onClick={redo}
          type="button"
        >
          ↷ {strings.redo}
        </button>
        <button
          aria-controls="scene-inspector"
          aria-expanded={inspectorOpen}
          className={styles.inspectorToggle}
          onClick={() => setInspectorOpen((current) => !current)}
          type="button"
        >
          {inspectorOpen ? strings.hideInspector : strings.showInspector}
        </button>
        <span>
          {warnings.some(({ code }) => code === "OUT_OF_BOUNDS")
            ? strings.boundsWarning
            : warnings.some(({ code }) => code === "COLLISION")
              ? strings.collisionWarning
              : strings.noWarnings}
        </span>
      </div>

      <div
        className={`${styles.workbench} ${
          inspectorOpen ? styles.inspectorOpen : styles.inspectorClosed
        }`}
      >
        <section
          aria-labelledby="scene-preview-heading"
          className={styles.previewPanel}
        >
          <div className={standeeStyles.panelHeading}>
            <h2 id="scene-preview-heading">{strings.scenePreviewHeading}</h2>
            <span>
              {document.footprintMm.width} × {document.footprintMm.depth} ×{" "}
              {document.footprintMm.height} {strings.millimetres}
            </span>
          </div>
          <div className={styles.canvasWrap}>
            <FaceboothCanvasBoundary
              canvasLabel={strings.scenePreviewHeading}
              fallback={fallback}
            >
              <FaceboothSceneStage
                artworkUrls={artworkUrls}
                cameraPreset={cameraPreset}
                document={document}
                onSelect={setSelection}
                selected={selection}
                showSelection={!captureMode}
              />
              <FaceboothPngCaptureBridge onReady={handlePngCaptureReady} />
            </FaceboothCanvasBoundary>
          </div>
          <div
            aria-label={strings.camera}
            className={standeeStyles.previewControls}
          >
            {(["FRONT", "THREE_QUARTER", "TOP"] as const).map((preset) => (
              <button
                aria-pressed={cameraPreset === preset}
                key={preset}
                onClick={() => setCameraPreset(preset)}
                type="button"
              >
                {preset === "FRONT"
                  ? strings.frontView
                  : preset === "TOP"
                    ? strings.topView
                    : strings.angleView}
              </button>
            ))}
          </div>
        </section>

        <aside
          aria-labelledby="scene-inspector-heading"
          className={styles.inspector}
          hidden={!inspectorOpen}
          id="scene-inspector"
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          <h2 id="scene-inspector-heading">{strings.sceneInspectorHeading}</h2>

          <div className={styles.exportDock}>
            <FaceboothExportControls
              aspect={document.footprintMm.width / document.footprintMm.depth}
              capture={pngCapture}
              name={name}
              prepareCapture={setCaptureMode}
              strings={strings}
            />
          </div>

          <fieldset>
            <legend>{strings.addObjects}</legend>
            <div className={styles.actionGrid}>
              <button onClick={addBackdrop} type="button">
                {strings.addBackdrop}
              </button>
              <button onClick={() => addShelf("SHELF")} type="button">
                {strings.addShelf}
              </button>
              <button onClick={() => addShelf("RISER")} type="button">
                {strings.addRiser}
              </button>
            </div>
            <h3>{strings.savedMerch}</h3>
            {merchLibrary.length ? (
              <div className={styles.merchList}>
                {merchLibrary.map((project) => (
                  <div key={project.id}>
                    <span>
                      <strong>{project.name}</strong>
                      <small>
                        {project.document.sizeMm.width} ×{" "}
                        {project.document.sizeMm.height} mm
                      </small>
                    </span>
                    <button onClick={() => placeMerch(project)} type="button">
                      {strings.placeMerch}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>{strings.noSavedMerch}</p>
            )}
          </fieldset>

          <fieldset>
            <legend>
              {strings.selection} · {selectionLabel}
            </legend>
            <div className={styles.selectionActions}>
              <button
                aria-pressed={moveMode}
                onClick={() => setMoveMode((current) => !current)}
                type="button"
              >
                {strings.moveMode}
              </button>
              <button
                disabled={selection.kind === "TABLE"}
                onClick={duplicateSelection}
                type="button"
              >
                {strings.duplicate}
              </button>
              <button
                disabled={selection.kind === "TABLE"}
                onClick={deleteSelection}
                type="button"
              >
                {strings.deleteSelection}
              </button>
            </div>
            <div aria-label={strings.moveHandle} className={styles.moveHandle}>
              <button
                aria-label={strings.moveForward}
                disabled={!moveMode}
                onClick={() => nudge("z", -gridMm)}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={strings.moveLeft}
                disabled={!moveMode}
                onClick={() => nudge("x", -gridMm)}
                type="button"
              >
                ←
              </button>
              <button
                aria-label={strings.moveRight}
                disabled={!moveMode}
                onClick={() => nudge("x", gridMm)}
                type="button"
              >
                →
              </button>
              <button
                aria-label={strings.moveBack}
                disabled={!moveMode}
                onClick={() => nudge("z", gridMm)}
                type="button"
              >
                ↓
              </button>
              <button
                aria-label={strings.rotateLeft}
                disabled={!moveMode}
                onClick={() => rotate(-15_000)}
                type="button"
              >
                ↺
              </button>
              <button
                aria-label={strings.rotateRight}
                disabled={!moveMode}
                onClick={() => rotate(15_000)}
                type="button"
              >
                ↻
              </button>
            </div>
            {selectedTransform ? (
              <div className={styles.fieldGrid}>
                {(["x", "y", "z"] as const).map((axis) => (
                  <NumericField
                    id={`scene-position-${axis}`}
                    key={axis}
                    label={
                      axis === "x"
                        ? strings.positionX
                        : axis === "y"
                          ? strings.positionY
                          : strings.positionZ
                    }
                    max={20_000}
                    min={-20_000}
                    onChange={(value) =>
                      updateTransform((transform) => ({
                        ...transform,
                        positionMm: {
                          ...transform.positionMm,
                          [axis]: value,
                        },
                      }))
                    }
                    value={selectedTransform.positionMm[axis]}
                  />
                ))}
                <NumericField
                  id="scene-rotation"
                  label={strings.rotation}
                  max={360_000}
                  min={-360_000}
                  onChange={(value) =>
                    updateTransform((transform) => ({
                      ...transform,
                      rotationMilliDegrees: {
                        ...transform.rotationMilliDegrees,
                        y: value,
                      },
                    }))
                  }
                  unit="m°"
                  value={selectedTransform.rotationMilliDegrees.y}
                />
              </div>
            ) : null}
            <div className={styles.snapRow}>
              <label>
                <span>{strings.gridSize}</span>
                <select
                  onChange={(event) => setGridMm(Number(event.target.value))}
                  value={gridMm}
                >
                  <option value="10">10 mm</option>
                  <option value="25">25 mm</option>
                  <option value="50">50 mm</option>
                  <option value="100">100 mm</option>
                </select>
              </label>
              <button
                onClick={() =>
                  commitDocument(
                    snapSceneSelection(document, selection, gridMm),
                  )
                }
                type="button"
              >
                {strings.snapGrid}
              </button>
              <button
                disabled={selection.kind === "TABLE"}
                onClick={() =>
                  commitDocument(snapSelectionToSurface(document, selection))
                }
                type="button"
              >
                {strings.snapSurface}
              </button>
            </div>
            {selectedSnapshot && updateIds.has(selectedSnapshot.id) ? (
              <div className={styles.updateNotice} role="status">
                <span>{strings.updateAvailable}</span>
                <button
                  disabled={!updateProject}
                  onClick={() => {
                    if (!updateProject) return;
                    commitDocument(
                      refreshMerchSnapshot(document, selectedSnapshot.id, {
                        projectId: updateProject.id,
                        editVersion: updateProject.editVersion,
                        name: updateProject.name,
                        document: updateProject.document,
                      }),
                    );
                  }}
                  type="button"
                >
                  {strings.applyUpdate}
                </button>
              </div>
            ) : null}
            {selectedBackdrop ? (
              <div className={styles.objectSettings}>
                <NumericField
                  id="backdrop-width"
                  label={strings.objectWidth}
                  max={10_000}
                  min={1}
                  onChange={(value) =>
                    commitDocument({
                      ...document,
                      backdrops: document.backdrops.map((backdrop) =>
                        backdrop.id === selectedBackdrop.id
                          ? {
                              ...backdrop,
                              sizeMm: { ...backdrop.sizeMm, width: value },
                            }
                          : backdrop,
                      ),
                    })
                  }
                  value={selectedBackdrop.sizeMm.width}
                />
                <NumericField
                  id="backdrop-height"
                  label={strings.objectHeight}
                  max={10_000}
                  min={1}
                  onChange={(value) =>
                    commitDocument({
                      ...document,
                      backdrops: document.backdrops.map((backdrop) =>
                        backdrop.id === selectedBackdrop.id
                          ? {
                              ...backdrop,
                              sizeMm: { ...backdrop.sizeMm, height: value },
                            }
                          : backdrop,
                      ),
                    })
                  }
                  value={selectedBackdrop.sizeMm.height}
                />
              </div>
            ) : null}
            {selectedShelf ? (
              <div className={styles.objectSettings}>
                {(["width", "depth", "height"] as const).map((axis) => (
                  <NumericField
                    id={`shelf-${axis}`}
                    key={axis}
                    label={
                      axis === "width"
                        ? strings.objectWidth
                        : axis === "depth"
                          ? strings.objectDepth
                          : strings.objectHeight
                    }
                    max={10_000}
                    min={1}
                    onChange={(value) =>
                      commitDocument({
                        ...document,
                        shelves: document.shelves.map((shelf) =>
                          shelf.id === selectedShelf.id
                            ? {
                                ...shelf,
                                sizeMm: { ...shelf.sizeMm, [axis]: value },
                              }
                            : shelf,
                        ),
                      })
                    }
                    value={selectedShelf.sizeMm[axis]}
                  />
                ))}
              </div>
            ) : null}
          </fieldset>

          <fieldset>
            <legend>{strings.sceneSettings}</legend>
            <div className={styles.fieldGrid}>
              <NumericField
                id="footprint-width"
                label={strings.footprintWidth}
                max={10_000}
                min={500}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    footprintMm: { ...document.footprintMm, width: value },
                  })
                }
                value={document.footprintMm.width}
              />
              <NumericField
                id="footprint-depth"
                label={strings.footprintDepth}
                max={10_000}
                min={500}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    footprintMm: { ...document.footprintMm, depth: value },
                  })
                }
                value={document.footprintMm.depth}
              />
              <NumericField
                id="footprint-height"
                label={strings.footprintHeight}
                max={5_000}
                min={500}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    footprintMm: { ...document.footprintMm, height: value },
                  })
                }
                value={document.footprintMm.height}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>{strings.tableSettings}</legend>
            <div className={styles.fieldGrid}>
              <NumericField
                id="table-width"
                label={strings.tableWidth}
                max={5_000}
                min={100}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    table: {
                      ...document.table,
                      sizeMm: { ...document.table.sizeMm, width: value },
                    },
                  })
                }
                value={document.table.sizeMm.width}
              />
              <NumericField
                id="table-depth"
                label={strings.tableDepth}
                max={5_000}
                min={100}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    table: {
                      ...document.table,
                      sizeMm: { ...document.table.sizeMm, depth: value },
                    },
                  })
                }
                value={document.table.sizeMm.depth}
              />
              <NumericField
                id="table-height"
                label={strings.tableHeight}
                max={2_000}
                min={100}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    table: {
                      ...document.table,
                      sizeMm: { ...document.table.sizeMm, height: value },
                    },
                  })
                }
                value={document.table.sizeMm.height}
              />
              <NumericField
                id="table-top-thickness"
                label={strings.topThickness}
                max={200}
                min={5}
                onChange={(value) =>
                  commitDocument({
                    ...document,
                    table: { ...document.table, topThicknessMm: value },
                  })
                }
                value={document.table.topThicknessMm}
              />
            </div>
            <div className={styles.selectGrid}>
              <label>
                <span>{strings.tableEdge}</span>
                <select
                  onChange={(event) =>
                    commitDocument({
                      ...document,
                      table: {
                        ...document.table,
                        edge: event.target
                          .value as FaceboothSceneDocument["table"]["edge"],
                      },
                    })
                  }
                  value={document.table.edge}
                >
                  <option value="SQUARE">{strings.square}</option>
                  <option value="ROUNDED">{strings.rounded}</option>
                  <option value="BEVELLED">{strings.bevelled}</option>
                </select>
              </label>
              <label>
                <span>{strings.legStyle}</span>
                <select
                  onChange={(event) =>
                    commitDocument({
                      ...document,
                      table: {
                        ...document.table,
                        legStyle: event.target
                          .value as FaceboothSceneDocument["table"]["legStyle"],
                      },
                    })
                  }
                  value={document.table.legStyle}
                >
                  <option value="FOUR_LEG">{strings.fourLeg}</option>
                  <option value="TRESTLE">{strings.trestle}</option>
                  <option value="PEDESTAL">{strings.pedestal}</option>
                </select>
              </label>
              <label>
                <span>{strings.finish}</span>
                <select
                  onChange={(event) =>
                    commitDocument({
                      ...document,
                      table: {
                        ...document.table,
                        finish: event.target
                          .value as FaceboothSceneDocument["table"]["finish"],
                      },
                    })
                  }
                  value={document.table.finish}
                >
                  <option value="WOOD_LIGHT">{strings.woodLight}</option>
                  <option value="WOOD_DARK">{strings.woodDark}</option>
                  <option value="WHITE">{strings.finishWhite}</option>
                  <option value="BLACK">{strings.finishBlack}</option>
                </select>
              </label>
            </div>
          </fieldset>
        </aside>
      </div>
    </div>
  );
}
