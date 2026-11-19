import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15D adds the manager-only Facebooth hub without widening STAFF access", async () => {
  const [sections, navigation, hub, route] = await Promise.all([
    readSource("lib/booth-sections.ts"),
    readSource("components/admin/admin-nav.tsx"),
    readSource("components/facebooth/facebooth-library.tsx"),
    readSource("app/manage/[boothId]/facebooth/page.tsx"),
  ]);
  assert.match(sections, /"facebooth"/);
  assert.match(sections, /normalizedRole === "STAFF" && section === "orders"/);
  assert.match(navigation, /faceboothLabel/);
  assert.match(hub, /renameFaceboothProjectAction/);
  assert.match(hub, /duplicateFaceboothProjectAction/);
  assert.match(hub, /deleteFaceboothProjectAction/);
  assert.match(hub, /parseFaceboothExportFile/);
  assert.equal((hub.match(/\bunoptimized\b/g) ?? []).length, 1);
  assert.match(route, /requireBoothRole\(boothId, \["OWNER", "ADMIN"\]\)/);
});

test("Facebooth keeps function-valued catalogues inside client boundaries", async () => {
  const [libraryRoute, projectRoute, library, standeeEditor, sceneEditor] =
    await Promise.all([
      readSource("app/manage/[boothId]/facebooth/page.tsx"),
      readSource("app/manage/[boothId]/facebooth/[projectId]/page.tsx"),
      readSource("components/facebooth/facebooth-library.tsx"),
      readSource("components/facebooth/standee-editor.tsx"),
      readSource("components/facebooth/scene-editor.tsx"),
    ]);

  assert.doesNotMatch(libraryRoute, /strings=\{/);
  assert.doesNotMatch(projectRoute, /strings=\{/);
  for (const clientComponent of [library, standeeEditor, sceneEditor]) {
    assert.match(clientComponent, /^"use client";/);
    assert.match(clientComponent, /getFaceboothStrings\(locale\)/);
  }
});

test("Facebooth manager timestamps hydrate in the Vietnam time zone", async () => {
  const [library, publicationPanel] = await Promise.all([
    readSource("components/facebooth/facebooth-library.tsx"),
    readSource("components/facebooth/facebooth-publication-panel.tsx"),
  ]);

  // createBoothDateTimeFormat pins booth time; tests/i18n-intl.test.ts proves
  // it, and the no-restricted-syntax lint rule forbids raw date formatters.
  assert.match(library, /createBoothDateTimeFormat\(locale/);
  assert.match(publicationPanel, /createBoothDateTimeFormat\(locale/);
});

test("Phase 15D keeps autosave, recovery, thumbnails, and PNG work in the browser", async () => {
  const [
    autosave,
    drafts,
    png,
    thumbnail,
    packageScript,
    projectService,
    standeeEditor,
    sceneEditor,
  ] = await Promise.all([
    readSource("components/facebooth/use-facebooth-autosave.ts"),
    readSource("lib/facebooth-drafts.ts"),
    readSource("components/facebooth/facebooth-png-export.tsx"),
    readSource("components/facebooth/use-facebooth-thumbnail.ts"),
    readSource("lib/facebooth-portable.ts"),
    readSource("lib/facebooth-projects.ts"),
    readSource("components/facebooth/standee-editor.tsx"),
    readSource("components/facebooth/scene-editor.tsx"),
  ]);
  assert.match(autosave, /window\.setTimeout\(\(\) => void save\(\), 1_000\)/);
  assert.match(autosave, /"OFFLINE"/);
  assert.match(autosave, /"CONFLICT"/);
  assert.match(autosave, /duplicateMyVersion/);
  assert.match(drafts, /indexedDB\.open/);
  assert.match(png, /WebGLRenderTarget/);
  assert.match(png, /readRenderTargetPixelsAsync/);
  assert.match(standeeEditor, /setPngCapture\(\(\) => capture\)/);
  assert.match(sceneEditor, /setPngCapture\(\(\) => capture\)/);
  assert.match(thumbnail, /6_000/);
  assert.match(thumbnail, /best-effort/);
  assert.match(
    projectService,
    /parsedInput\.data\.previewObjectKey === undefined\s*\? existing\.previewObjectKey/,
  );
  assert.match(packageScript, /crypto\.subtle\.digest/);
  assert.doesNotMatch(
    `${autosave}\n${png}\n${thumbnail}`,
    /BullMQ|Redis|cron|rendering job/i,
  );
});
