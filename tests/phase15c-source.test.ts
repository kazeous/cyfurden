import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15C renders bounded true-size scene primitives without arbitrary scaling", async () => {
  const [model, editor, documents] = await Promise.all([
    readSource("components/facebooth/scene-model.tsx"),
    readSource("components/facebooth/scene-editor.tsx"),
    readSource("lib/facebooth-documents.ts"),
  ]);
  assert.match(model, /FaceboothSceneStage/);
  assert.match(model, /SceneTable/);
  assert.match(model, /StandeeObject/);
  assert.match(model, /OrbitControls/);
  assert.match(model, /Grid/);
  assert.match(editor, /addBackdrop/);
  assert.match(editor, /addShelf\("SHELF"\)/);
  assert.match(editor, /addShelf\("RISER"\)/);
  assert.doesNotMatch(editor, /scaleMm|arbitraryScale|Scale selected/);
  assert.match(documents, /sourceEditVersion/);
  assert.match(documents, /Each merch project revision must have one snapshot/);
});

test("Phase 15C keeps selection, move, snap, warnings, and history in the DOM inspector", async () => {
  const [editor, scene, styles, route] = await Promise.all([
    readSource("components/facebooth/scene-editor.tsx"),
    readSource("lib/facebooth-scene.ts"),
    readSource("components/facebooth/scene-editor.module.css"),
    readSource("app/manage/[boothId]/facebooth/[projectId]/page.tsx"),
  ]);
  assert.match(editor, /moveHandle/);
  assert.match(editor, /snapSceneSelection/);
  assert.match(editor, /snapSelectionToSurface/);
  assert.match(editor, /undoSceneHistory/);
  assert.match(editor, /redoSceneHistory/);
  assert.match(editor, /updateAvailable/);
  assert.match(editor, /editVersion === snapshot\.sourceEditVersion/);
  assert.match(scene, /limit = 50/);
  assert.match(scene, /COLLISION/);
  assert.match(scene, /OUT_OF_BOUNDS/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /sheetHandle/);
  assert.match(route, /kind: "MERCH"/);
  assert.match(route, /SceneEditor/);
});
