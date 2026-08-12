import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { supportsFaceboothWebGl2 } from "../lib/facebooth-rendering";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15F keeps WebGL2 detection safe and the canvas recoverable", async () => {
  const supportedDocument = {
    createElement: () => ({
      getContext: (kind: string) => (kind === "webgl2" ? {} : null),
    }),
  } as unknown as Pick<Document, "createElement">;
  const unsupportedDocument = {
    createElement: () => ({ getContext: () => null }),
  } as unknown as Pick<Document, "createElement">;
  const throwingDocument = {
    createElement: () => {
      throw new Error("canvas unavailable");
    },
  } as unknown as Pick<Document, "createElement">;

  assert.equal(supportsFaceboothWebGl2(supportedDocument), true);
  assert.equal(supportsFaceboothWebGl2(unsupportedDocument), false);
  assert.equal(supportsFaceboothWebGl2(throwingDocument), false);

  const runtime = await readSource(
    "components/facebooth/facebooth-canvas-runtime.tsx",
  );
  assert.match(runtime, /frameloop="demand"/);
  assert.match(runtime, /webglcontextlost/);
  assert.match(runtime, /webglcontextrestored/);
  assert.match(runtime, /event\.preventDefault\(\)/);
  assert.match(runtime, /renderLists\.dispose\(\)/);
  assert.match(runtime, /setAttribute\("aria-label", canvasLabel\)/);
  assert.match(runtime, /setAttribute\("role", "img"\)/);
});

test("Phase 15F suppresses only the known Three clock warning", async () => {
  const runtime = await readSource(
    "components/facebooth/facebooth-canvas-runtime.tsx",
  );
  assert.match(runtime, /getConsoleFunction/);
  assert.match(runtime, /setConsoleFunction/);
  assert.match(runtime, /THREE\.Clock: This module has been deprecated/);
  assert.match(
    runtime,
    /inheritedConsoleFunction\(level, message, \.\.\.params\)/,
  );
  assert.match(runtime, /console\.error\(message, \.\.\.params\)/);
  assert.match(runtime, /console\.warn\(message, \.\.\.params\)/);
});

test("Phase 15F public Facebooth surfaces retain responsive and accessible states", async () => {
  const [viewerCss, cardCss, editorCss] = await Promise.all([
    readSource("components/facebooth/public-facebooth-viewer.module.css"),
    readSource("components/storefront/facebooth-showcase-card.module.css"),
    readSource("components/facebooth/standee-editor.module.css"),
  ]);
  const publicCss = `${viewerCss}\n${cardCss}`;

  assert.match(viewerCss, /@media \(max-width: 560px\)/);
  assert.match(viewerCss, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(cardCss, /@media \(max-width: 720px\)/);
  assert.match(publicCss, /:focus-visible/);
  assert.match(publicCss, /:active/);
  assert.match(publicCss, /overflow-wrap: anywhere/);
  assert.match(publicCss, /white-space: nowrap/);
  assert.match(
    editorCss,
    /\.canvasFallback[\s\S]*background: var\(--color-dark\)/,
  );
  assert.doesNotMatch(publicCss, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(publicCss, /rgba?\(/i);
});

test("Facebooth scene editor uses a full-viewport studio with a dismissible inspector", async () => {
  const [sceneSource, sceneCss, adminCss] = await Promise.all([
    readSource("components/facebooth/scene-editor.tsx"),
    readSource("components/facebooth/scene-editor.module.css"),
    readSource("components/admin/admin.module.css"),
  ]);

  assert.match(
    sceneCss,
    /\.studioPage\s*\{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\);/,
  );
  assert.match(
    sceneCss,
    /\.previewPanel\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto;/,
  );
  assert.match(sceneCss, /\.inspectorClosed\s*\{/);
  assert.match(sceneCss, /max-height: min\(48svh, 32rem\)/);
  assert.match(sceneSource, /aria-controls="scene-inspector"/);
  assert.match(sceneSource, /aria-expanded=\{inspectorOpen\}/);
  assert.match(sceneSource, /hidden=\{!inspectorOpen\}/);
  assert.match(sceneSource, /data-facebooth-studio/);
  assert.match(
    adminCss,
    /\.adminApp:has\(\[data-facebooth-studio\]\)\s*\{[\s\S]*padding: 0;[\s\S]*overflow: hidden;[\s\S]*\.adminSidebar/,
  );
  assert.doesNotMatch(sceneCss, /width:\s*100vw/);
});

test("Phase 15F passes the Hallmark token and interaction source gates", async () => {
  const auditedCss = (
    await Promise.all(
      [
        "components/facebooth/facebooth-autosave-controls.module.css",
        "components/facebooth/facebooth-export-controls.module.css",
        "components/facebooth/facebooth-library.module.css",
        "components/facebooth/facebooth-publication-panel.module.css",
        "components/facebooth/public-facebooth-viewer.module.css",
        "components/facebooth/scene-editor.module.css",
        "components/facebooth/standee-editor.module.css",
        "components/storefront/facebooth-showcase-card.module.css",
      ].map(readSource),
    )
  ).join("\n");

  assert.match(auditedCss, /Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5/);
  assert.match(auditedCss, /:focus-visible/);
  assert.match(auditedCss, /:active/);
  assert.match(auditedCss, /:disabled/);
  assert.match(auditedCss, /white-space: nowrap/);
  assert.doesNotMatch(auditedCss, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(auditedCss, /rgba?\(/i);
  assert.doesNotMatch(auditedCss, /:\s*transparent\s*;/i);
  assert.doesNotMatch(auditedCss, /transition(?:-property)?:\s*all\b/i);
  assert.doesNotMatch(auditedCss, /(?:padding|margin|gap)[^:]*:[^;]*38px/i);
});

test("Facebooth controls align button text and paired field rows", async () => {
  const [standeeCss, sceneCss, autosaveCss, exportCss] = await Promise.all([
    readSource("components/facebooth/standee-editor.module.css"),
    readSource("components/facebooth/scene-editor.module.css"),
    readSource("components/facebooth/facebooth-autosave-controls.module.css"),
    readSource("components/facebooth/facebooth-export-controls.module.css"),
  ]);

  assert.match(
    standeeCss,
    /\.previewControls button,[\s\S]*\.segmented button \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;/,
  );
  assert.match(
    standeeCss,
    /\.fieldGrid > \.field > span:first-child \{[\s\S]*min-height: 2\.7em;/,
  );
  assert.match(
    sceneCss,
    /\.historyBar button,[\s\S]*\.updateNotice button \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;/,
  );
  assert.match(
    sceneCss,
    /\.fieldGrid > \.field > span:first-child,[\s\S]*\.selectGrid > label > span:first-child \{[\s\S]*min-height: 2\.7em;/,
  );
  for (const sharedControls of [autosaveCss, exportCss]) {
    assert.match(
      sharedControls,
      /button(?:,| \{)[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;/,
    );
  }
});
