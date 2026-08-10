import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultAcrylicStandeeDocument,
  createDefaultFaceboothSceneDocument,
  faceboothSceneDocumentSchema,
} from "../lib/facebooth-documents";
import {
  addMerchRevisionSnapshot,
  analyzeFaceboothScene,
  createSceneHistory,
  findSceneSnapshotUpdates,
  pushSceneHistory,
  redoSceneHistory,
  refreshMerchSnapshot,
  snapSceneSelection,
  snapSelectionToSurface,
  undoSceneHistory,
  updateSceneTransform,
} from "../lib/facebooth-scene";

const transform = (x: number, y: number, z: number, rotation = 0) => ({
  positionMm: { x, y, z },
  rotationMilliDegrees: { x: 0, y: rotation, z: 0 },
});

test("scene transforms, grid snapping, bounds, and collisions are deterministic", () => {
  let scene = createDefaultFaceboothSceneDocument();
  scene = updateSceneTransform(
    scene,
    { kind: "TABLE", id: "table" },
    transform(127, 0, 151, 17_000),
  );
  scene = snapSceneSelection(scene, { kind: "TABLE", id: "table" }, 50);
  assert.deepEqual(scene.table.transform, transform(150, 0, 150, 15_000));
  scene = faceboothSceneDocumentSchema.parse({
    ...scene,
    backdrops: [
      {
        id: "backdrop-1",
        sizeMm: { width: 3_200, height: 2_000, thickness: 30 },
        finish: "WHITE",
        transform: transform(0, 0, 0),
      },
    ],
  });
  const warnings = analyzeFaceboothScene(scene);
  assert.ok(
    warnings.some(
      (warning) =>
        warning.code === "OUT_OF_BOUNDS" && warning.objectId === "backdrop-1",
    ),
  );
  assert.ok(warnings.some((warning) => warning.code === "COLLISION"));
});

test("surface snapping places known objects on the table without scale drift", () => {
  let scene = createDefaultFaceboothSceneDocument();
  scene = faceboothSceneDocumentSchema.parse({
    ...scene,
    backdrops: [
      {
        id: "backdrop-floor",
        sizeMm: { width: 1_000, height: 1_800, thickness: 30 },
        finish: "WHITE",
        transform: transform(0, 900, 0),
      },
    ],
    shelves: [
      {
        id: "riser-1",
        kind: "RISER",
        sizeMm: { width: 300, depth: 200, height: 80 },
        finish: "CLEAR",
        transform: transform(0, 0, 0),
      },
    ],
  });
  scene = snapSelectionToSurface(scene, { kind: "SHELF", id: "riser-1" });
  assert.equal(scene.shelves[0].transform.positionMm.y, 740);
  assert.deepEqual(scene.shelves[0].sizeMm, {
    width: 300,
    depth: 200,
    height: 80,
  });
  scene = snapSelectionToSurface(scene, {
    kind: "BACKDROP",
    id: "backdrop-floor",
  });
  assert.equal(scene.backdrops[0].transform.positionMm.y, 0);
});

test("merch revisions deduplicate, report updates, and refresh only explicitly", () => {
  const scene = createDefaultFaceboothSceneDocument();
  const merch = {
    snapshotId: "snapshot-1",
    projectId: "merch-1",
    editVersion: 2,
    name: "Garden",
    document: createDefaultAcrylicStandeeDocument(),
  };
  const first = addMerchRevisionSnapshot(scene, merch);
  const duplicate = addMerchRevisionSnapshot(first.document, {
    ...merch,
    snapshotId: "snapshot-2",
  });
  assert.equal(duplicate.document.merchSnapshots.length, 1);
  assert.equal(duplicate.snapshotId, "snapshot-1");
  assert.deepEqual(
    [
      ...findSceneSnapshotUpdates(duplicate.document, [
        { id: "merch-1", editVersion: 3 },
      ]),
    ],
    ["snapshot-1"],
  );
  assert.equal(duplicate.document.merchSnapshots[0].sourceEditVersion, 2);
  const refreshed = refreshMerchSnapshot(duplicate.document, "snapshot-1", {
    ...merch,
    editVersion: 3,
  });
  assert.equal(refreshed.merchSnapshots[0].sourceEditVersion, 3);
});

test("scene undo and redo retain at most fifty complete document states", () => {
  let history = createSceneHistory(createDefaultFaceboothSceneDocument());
  for (let value = 1; value <= 60; value += 1) {
    const next = updateSceneTransform(
      history.entries[history.index],
      { kind: "TABLE", id: "table" },
      transform(value, 0, 0),
    );
    history = pushSceneHistory(history, next);
  }
  assert.equal(history.entries.length, 50);
  const undone = undoSceneHistory(history);
  assert.equal(undone.document.table.transform.positionMm.x, 59);
  const redone = redoSceneHistory(undone.history);
  assert.equal(redone.document.table.transform.positionMm.x, 60);
});
