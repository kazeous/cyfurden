import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15E publishes one immutable manager-selected showcase", async () => {
  const [panel, actions, service, hub] = await Promise.all([
    readSource("components/facebooth/facebooth-publication-panel.tsx"),
    readSource("app/manage/[boothId]/facebooth/actions.ts"),
    readSource("lib/facebooth-projects.ts"),
    readSource("app/manage/[boothId]/facebooth/page.tsx"),
  ]);
  assert.match(panel, /type="radio"/);
  assert.match(panel, /merchProjectIds\.length >= 6/);
  assert.match(panel, /publishFaceboothSnapshotAction/);
  assert.match(panel, /unpublishFaceboothSnapshotAction/);
  assert.match(actions, /requireBoothRole\(boothId, faceboothManagerRoles\)/);
  assert.match(service, /previewObjectKey: sceneRecord\.previewObjectKey/);
  assert.match(service, /facebooth\.publication_unpublished/);
  assert.match(hub, /readFaceboothPublicationForManager/);
});

test("Phase 15E gates and lazy-loads a display-only public viewer", async () => {
  const [publicRead, route, viewer, webgl, canvasRuntime, storefront, card] =
    await Promise.all([
      readSource("lib/facebooth-public.ts"),
      readSource("app/s/[slug]/facebooth/page.tsx"),
      readSource("components/facebooth/public-facebooth-viewer.tsx"),
      readSource("components/facebooth/public-facebooth-webgl.tsx"),
      readSource("components/facebooth/facebooth-canvas-runtime.tsx"),
      readSource("components/storefront/managed-storefront.tsx"),
      readSource("components/storefront/facebooth-showcase-card.tsx"),
    ]);
  assert.match(publicRead, /booth\.status !== "PUBLISHED"/);
  assert.match(publicRead, /!booth\.storefront\?\.publishedDocument/);
  assert.match(publicRead, /parseFaceboothPublicationDocument/);
  assert.match(route, /if \(!published\) notFound\(\)/);
  assert.match(viewer, /dynamic\(/);
  assert.match(viewer, /ssr: false/);
  assert.match(
    viewer,
    /aria-hidden="true" className=\{styles\.fallbackUnderlay\}/,
  );
  assert.match(viewer, /displayOnly/);
  assert.doesNotMatch(
    viewer,
    /Product|cart|stock|reservation|promotion|gacha|payment/i,
  );
  assert.match(webgl, /FaceboothCanvasBoundary/);
  assert.match(webgl, /showSelection=\{false\}/);
  assert.match(canvasRuntime, /!ready \|\| contextLost/);
  assert.match(storefront, /FaceboothShowcaseCard/);
  assert.doesNotMatch(card, /@react-three|three|facebooth-canvas/i);
  assert.doesNotMatch(
    `${publicRead}\n${route}\n${viewer}\n${webgl}`,
    /BullMQ|Redis|cron|rendering job|payment action|inventory mutation/i,
  );
});
