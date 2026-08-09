import assert from "node:assert/strict";
import test from "node:test";
import {
  acrylicStandeeDocumentSchema,
  createDefaultAcrylicStandeeDocument,
  createDefaultFaceboothSceneDocument,
  faceboothExportPackageSchema,
  faceboothPublicationDocumentSchema,
  faceboothSceneDocumentSchema,
  FACEBOOTH_ASSET_MAX_BYTES,
  FACEBOOTH_DOCUMENT_MAX_BYTES,
  FACEBOOTH_MAX_CONTOUR_POINTS,
  parseFaceboothProjectDocument,
} from "../lib/facebooth-documents";

test("Facebooth v1 defaults use strict bounded integer millimetres", () => {
  const merch = createDefaultAcrylicStandeeDocument();
  const scene = createDefaultFaceboothSceneDocument();
  assert.equal(acrylicStandeeDocumentSchema.safeParse(merch).success, true);
  assert.equal(faceboothSceneDocumentSchema.safeParse(scene).success, true);
  assert.equal(parseFaceboothProjectDocument("MERCH", merch)?.kind, "MERCH");
  assert.equal(parseFaceboothProjectDocument("SCENE", scene)?.kind, "SCENE");

  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({
      ...merch,
      sizeMm: { ...merch.sizeMm, width: 100.5 },
    }).success,
    false,
  );
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({
      ...merch,
      sizeMm: { ...merch.sizeMm, width: 20_001 },
    }).success,
    false,
  );
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({ ...merch, remoteUrl: "https://x" })
      .success,
    false,
  );
  assert.equal(
    faceboothSceneDocumentSchema.safeParse({
      ...scene,
      table: {
        ...scene.table,
        transform: {
          ...scene.table.transform,
          positionMm: {
            ...scene.table.transform.positionMm,
            x: 0.25,
          },
        },
      },
    }).success,
    false,
  );
});

test("Facebooth artwork and scene collection limits fail closed", () => {
  const merch = createDefaultAcrylicStandeeDocument();
  const objectKey =
    "booths/booth-1/facebooth/artwork-00000000-0000-4000-8000-000000000000.png";
  const contourPoints = Array.from(
    { length: FACEBOOTH_MAX_CONTOUR_POINTS },
    (_, index) => ({
      xMillionths: index * 1_000,
      yMillionths: index * 1_000,
    }),
  );
  const withArtwork = {
    ...merch,
    artwork: {
      objectKey,
      contentType: "image/png" as const,
      pixelWidth: 1_000,
      pixelHeight: 1_500,
      contourPoints,
      opaqueFallback: false,
    },
  };
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse(withArtwork).success,
    true,
  );
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({
      ...withArtwork,
      artwork: {
        ...withArtwork.artwork,
        contourPoints: [...contourPoints, { xMillionths: 1, yMillionths: 1 }],
      },
    }).success,
    false,
  );
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({
      ...merch,
      artwork: { ...merch.artwork, objectKey },
    }).success,
    false,
  );
  assert.equal(
    acrylicStandeeDocumentSchema.safeParse({
      ...withArtwork,
      artwork: { ...withArtwork.artwork, contentType: "image/webp" },
    }).success,
    false,
  );

  const scene = createDefaultFaceboothSceneDocument();
  assert.equal(
    faceboothSceneDocumentSchema.safeParse({
      ...scene,
      instances: [
        {
          id: "instance-1",
          merchSnapshotId: "missing",
          transform: scene.table.transform,
        },
      ],
    }).success,
    false,
  );
});

test("Facebooth publications are self-contained and select no more than six merch", () => {
  const merch = createDefaultAcrylicStandeeDocument();
  const scene = createDefaultFaceboothSceneDocument();
  const publication = {
    version: 1 as const,
    publishedAt: new Date().toISOString(),
    scene: {
      projectId: "scene-1",
      editVersion: 4,
      name: "Table plan",
      document: scene,
    },
    merch: Array.from({ length: 6 }, (_, index) => ({
      projectId: `merch-${index}`,
      editVersion: 1,
      name: `Standee ${index}`,
      document: merch,
    })),
    previewObjectKey: null,
  };
  assert.equal(
    faceboothPublicationDocumentSchema.safeParse(publication).success,
    true,
  );
  assert.equal(
    faceboothPublicationDocumentSchema.safeParse({
      ...publication,
      merch: [
        ...publication.merch,
        {
          projectId: "merch-7",
          editVersion: 1,
          name: "Standee 7",
          document: merch,
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    faceboothPublicationDocumentSchema.safeParse({
      ...publication,
      merch: [publication.merch[0], publication.merch[0]],
    }).success,
    false,
  );
});

test("portable Facebooth packages reject remote, executable, oversized, and mismatched data", () => {
  const project = {
    name: "Blank standee",
    kind: "MERCH" as const,
    document: createDefaultAcrylicStandeeDocument(),
  };
  const valid = {
    format: "CYFURDEN_FACEBOOTH_PROJECT" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    project,
    assets: [],
  };
  assert.equal(faceboothExportPackageSchema.safeParse(valid).success, true);
  assert.equal(
    faceboothExportPackageSchema.safeParse({ ...valid, version: 2 }).success,
    false,
  );
  assert.equal(
    faceboothExportPackageSchema.safeParse({
      ...valid,
      assets: [
        {
          sourceObjectKey: "https://remote.invalid/image.png",
          contentType: "application/javascript",
          byteLength: FACEBOOTH_ASSET_MAX_BYTES + 1,
          sha256: "0".repeat(64),
          dataBase64: "YWxlcnQoMSk=",
        },
      ],
    }).success,
    false,
  );
  assert.equal(FACEBOOTH_DOCUMENT_MAX_BYTES, 512 * 1024);
});
