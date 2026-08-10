import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15B uses one dynamic demand-render WebGL2 boundary with recovery", async () => {
  const [boundary, runtime, rendering, editor] = await Promise.all([
    readSource("components/facebooth/facebooth-canvas-boundary.tsx"),
    readSource("components/facebooth/facebooth-canvas-runtime.tsx"),
    readSource("lib/facebooth-rendering.ts"),
    readSource("components/facebooth/standee-editor.tsx"),
  ]);
  assert.match(boundary, /dynamic\(/);
  assert.match(boundary, /ssr: false/);
  assert.match(boundary, /supportsFaceboothWebGl2/);
  assert.match(runtime, /frameloop="demand"/);
  assert.match(runtime, /dpr=\{\[1, 1\.75\]\}/);
  assert.match(runtime, /webglcontextlost/);
  assert.match(runtime, /webglcontextrestored/);
  assert.match(runtime, /renderLists\.dispose/);
  assert.match(rendering, /getContext\("webgl2"/);
  assert.match(editor, /webglFallback/);
});

test("Phase 15B traces artwork in a Worker and exposes bounded standee controls", async () => {
  const [worker, traceClient, model, editor, route] = await Promise.all([
    readSource("components/facebooth/alpha-contour.worker.ts"),
    readSource("components/facebooth/trace-artwork.ts"),
    readSource("components/facebooth/standee-model.tsx"),
    readSource("components/facebooth/standee-editor.tsx"),
    readSource("app/manage/[boothId]/facebooth/[projectId]/page.tsx"),
  ]);
  assert.match(worker, /OffscreenCanvas/);
  assert.match(worker, /traceFaceboothAlphaContour/);
  assert.match(traceClient, /new Worker/);
  assert.match(traceClient, /worker\.terminate/);
  assert.match(model, /ExtrudeGeometry/);
  assert.match(model, /acrylicGeometry\.dispose/);
  assert.match(model, /2_048 \/ Math\.max/);
  assert.match(model, /currentBitmap\?\.close/);
  assert.match(model, /OrbitControls/);
  assert.match(editor, /FACEBOOTH_ASSET_MAX_BYTES/);
  assert.match(editor, /resizeStandeePreservingAspect/);
  assert.match(editor, /"FRONT", "THREE_QUARTER", "SIDE", "TOP"/);
  assert.match(route, /requireBoothRole\(boothId, \["OWNER", "ADMIN"\]\)/);
});
