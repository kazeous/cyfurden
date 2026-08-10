import {
  faceboothSceneDocumentSchema,
  type AcrylicStandeeDocument,
  type FaceboothSceneDocument,
} from "@/lib/facebooth-documents";

export type SceneSelection =
  | { kind: "TABLE"; id: "table" }
  | { kind: "BACKDROP"; id: string }
  | { kind: "SHELF"; id: string }
  | { kind: "INSTANCE"; id: string };

export type SceneWarning = {
  code: "OUT_OF_BOUNDS" | "COLLISION";
  objectId: string;
  relatedObjectId?: string;
};

type SceneTransform = FaceboothSceneDocument["table"]["transform"];

export type SceneHistory = {
  entries: FaceboothSceneDocument[];
  index: number;
  limit: number;
};

const cloneScene = (scene: FaceboothSceneDocument) => structuredClone(scene);

export function snapSceneValue(value: number, gridMm: number) {
  const grid = Math.max(1, Math.round(gridMm));
  return Math.round(value / grid) * grid;
}

export function createSceneHistory(
  initial: FaceboothSceneDocument,
  limit = 50,
): SceneHistory {
  return { entries: [cloneScene(initial)], index: 0, limit };
}

export function pushSceneHistory(
  history: SceneHistory,
  next: FaceboothSceneDocument,
): SceneHistory {
  const entries = [
    ...history.entries.slice(0, history.index + 1),
    cloneScene(next),
  ].slice(-history.limit);
  return { ...history, entries, index: entries.length - 1 };
}

export function undoSceneHistory(history: SceneHistory) {
  const index = Math.max(0, history.index - 1);
  return {
    history: { ...history, index },
    document: cloneScene(history.entries[index]),
  };
}

export function redoSceneHistory(history: SceneHistory) {
  const index = Math.min(history.entries.length - 1, history.index + 1);
  return {
    history: { ...history, index },
    document: cloneScene(history.entries[index]),
  };
}

export function updateSceneTransform(
  scene: FaceboothSceneDocument,
  selection: SceneSelection,
  transform: SceneTransform,
) {
  const next = cloneScene(scene);
  if (selection.kind === "TABLE") next.table.transform = transform;
  if (selection.kind === "BACKDROP") {
    const target = next.backdrops.find(({ id }) => id === selection.id);
    if (target) target.transform = transform;
  }
  if (selection.kind === "SHELF") {
    const target = next.shelves.find(({ id }) => id === selection.id);
    if (target) target.transform = transform;
  }
  if (selection.kind === "INSTANCE") {
    const target = next.instances.find(({ id }) => id === selection.id);
    if (target) target.transform = transform;
  }
  const parsed = faceboothSceneDocumentSchema.safeParse(next);
  return parsed.success ? parsed.data : scene;
}

export function getSceneTransform(
  scene: FaceboothSceneDocument,
  selection: SceneSelection,
) {
  if (selection.kind === "TABLE") return scene.table.transform;
  if (selection.kind === "BACKDROP")
    return scene.backdrops.find(({ id }) => id === selection.id)?.transform;
  if (selection.kind === "SHELF")
    return scene.shelves.find(({ id }) => id === selection.id)?.transform;
  return scene.instances.find(({ id }) => id === selection.id)?.transform;
}

function rotationBounds(
  width: number,
  depth: number,
  rotationMilliDegrees: number,
) {
  const radians = (rotationMilliDegrees / 1_000 / 180) * Math.PI;
  return {
    width:
      Math.abs(width * Math.cos(radians)) + Math.abs(depth * Math.sin(radians)),
    depth:
      Math.abs(width * Math.sin(radians)) + Math.abs(depth * Math.cos(radians)),
  };
}

function objectBoxes(scene: FaceboothSceneDocument) {
  const snapshotById = new Map(
    scene.merchSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  return [
    {
      id: "table",
      width: scene.table.sizeMm.width,
      depth: scene.table.sizeMm.depth,
      height: scene.table.sizeMm.height,
      transform: scene.table.transform,
    },
    ...scene.backdrops.map((backdrop) => ({
      id: backdrop.id,
      width: backdrop.sizeMm.width,
      depth: backdrop.sizeMm.thickness,
      height: backdrop.sizeMm.height,
      transform: backdrop.transform,
    })),
    ...scene.shelves.map((shelf) => ({
      id: shelf.id,
      width: shelf.sizeMm.width,
      depth: shelf.sizeMm.depth,
      height: shelf.sizeMm.height,
      transform: shelf.transform,
    })),
    ...scene.instances.flatMap((instance) => {
      const document = snapshotById.get(instance.merchSnapshotId)?.document;
      return document
        ? [
            {
              id: instance.id,
              width: document.sizeMm.width,
              depth: Math.max(
                document.sizeMm.thickness,
                document.base.enabled ? document.base.depthMm : 0,
              ),
              height:
                document.sizeMm.height +
                (document.base.enabled ? document.base.thicknessMm : 0),
              transform: instance.transform,
            },
          ]
        : [];
    }),
  ].map((box) => ({
    ...box,
    ...rotationBounds(
      box.width,
      box.depth,
      box.transform.rotationMilliDegrees.y,
    ),
  }));
}

export function analyzeFaceboothScene(scene: FaceboothSceneDocument) {
  const document = faceboothSceneDocumentSchema.parse(scene);
  const boxes = objectBoxes(document);
  const warnings: SceneWarning[] = [];
  for (const box of boxes) {
    const x = box.transform.positionMm.x;
    const y = box.transform.positionMm.y;
    const z = box.transform.positionMm.z;
    if (
      x - box.width / 2 < -document.footprintMm.width / 2 ||
      x + box.width / 2 > document.footprintMm.width / 2 ||
      z - box.depth / 2 < -document.footprintMm.depth / 2 ||
      z + box.depth / 2 > document.footprintMm.depth / 2 ||
      y < 0 ||
      y + box.height > document.footprintMm.height
    ) {
      warnings.push({ code: "OUT_OF_BOUNDS", objectId: box.id });
    }
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    const left = boxes[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < boxes.length;
      rightIndex += 1
    ) {
      const right = boxes[rightIndex];
      const overlapX =
        Math.abs(left.transform.positionMm.x - right.transform.positionMm.x) <
        (left.width + right.width) / 2;
      const overlapZ =
        Math.abs(left.transform.positionMm.z - right.transform.positionMm.z) <
        (left.depth + right.depth) / 2;
      const overlapY =
        left.transform.positionMm.y <
          right.transform.positionMm.y + right.height &&
        right.transform.positionMm.y <
          left.transform.positionMm.y + left.height;
      if (overlapX && overlapY && overlapZ) {
        warnings.push({
          code: "COLLISION",
          objectId: left.id,
          relatedObjectId: right.id,
        });
      }
    }
  }
  return warnings;
}

export function snapSceneSelection(
  scene: FaceboothSceneDocument,
  selection: SceneSelection,
  gridMm: number,
) {
  const transform = getSceneTransform(scene, selection);
  if (!transform) return scene;
  return updateSceneTransform(scene, selection, {
    ...transform,
    positionMm: {
      x: snapSceneValue(transform.positionMm.x, gridMm),
      y: snapSceneValue(transform.positionMm.y, gridMm),
      z: snapSceneValue(transform.positionMm.z, gridMm),
    },
    rotationMilliDegrees: {
      ...transform.rotationMilliDegrees,
      y: snapSceneValue(transform.rotationMilliDegrees.y, 15_000),
    },
  });
}

export function snapSelectionToSurface(
  scene: FaceboothSceneDocument,
  selection: SceneSelection,
) {
  const transform = getSceneTransform(scene, selection);
  if (!transform || selection.kind === "TABLE") return scene;
  let surfaceY = 0;
  const { x, z } = transform.positionMm;
  const table = scene.table;
  const withinTable =
    Math.abs(x - table.transform.positionMm.x) <= table.sizeMm.width / 2 &&
    Math.abs(z - table.transform.positionMm.z) <= table.sizeMm.depth / 2;
  if (
    withinTable &&
    (selection.kind === "INSTANCE" || selection.kind === "SHELF")
  ) {
    surfaceY = table.transform.positionMm.y + table.sizeMm.height;
  }
  return updateSceneTransform(scene, selection, {
    ...transform,
    positionMm: { ...transform.positionMm, y: surfaceY },
  });
}

export function addMerchRevisionSnapshot(
  scene: FaceboothSceneDocument,
  merch: {
    snapshotId: string;
    projectId: string;
    editVersion: number;
    name: string;
    document: AcrylicStandeeDocument;
  },
) {
  const existing = scene.merchSnapshots.find(
    (snapshot) =>
      snapshot.sourceProjectId === merch.projectId &&
      snapshot.sourceEditVersion === merch.editVersion,
  );
  if (existing) return { document: scene, snapshotId: existing.id };
  const document = faceboothSceneDocumentSchema.parse({
    ...scene,
    merchSnapshots: [
      ...scene.merchSnapshots,
      {
        id: merch.snapshotId,
        sourceProjectId: merch.projectId,
        sourceEditVersion: merch.editVersion,
        name: merch.name,
        document: merch.document,
      },
    ],
  });
  return { document, snapshotId: merch.snapshotId };
}

export function refreshMerchSnapshot(
  scene: FaceboothSceneDocument,
  snapshotId: string,
  merch: {
    projectId: string;
    editVersion: number;
    name: string;
    document: AcrylicStandeeDocument;
  },
) {
  return faceboothSceneDocumentSchema.parse({
    ...scene,
    merchSnapshots: scene.merchSnapshots.map((snapshot) =>
      snapshot.id === snapshotId
        ? {
            ...snapshot,
            sourceProjectId: merch.projectId,
            sourceEditVersion: merch.editVersion,
            name: merch.name,
            document: merch.document,
          }
        : snapshot,
    ),
  });
}

export function findSceneSnapshotUpdates(
  scene: FaceboothSceneDocument,
  merch: Array<{ id: string; editVersion: number }>,
) {
  const current = new Map(
    merch.map((project) => [project.id, project.editVersion]),
  );
  return new Set(
    scene.merchSnapshots
      .filter(
        (snapshot) =>
          (current.get(snapshot.sourceProjectId) ??
            snapshot.sourceEditVersion) > snapshot.sourceEditVersion,
      )
      .map((snapshot) => snapshot.id),
  );
}
