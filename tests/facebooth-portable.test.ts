import assert from "node:assert/strict";
import test from "node:test";
import { resolveFaceboothPngSize } from "../components/facebooth/facebooth-png-export";
import {
  createDefaultAcrylicStandeeDocument,
  faceboothExportPackageSchema,
} from "../lib/facebooth-documents";
import { faceboothDraftKey } from "../lib/facebooth-drafts";
import {
  createFaceboothExportPackage,
  FaceboothPortableError,
  parseFaceboothExportFile,
  replaceFaceboothArtworkObjectKeys,
} from "../lib/facebooth-portable";

const sourceObjectKey =
  "booths/booth-1/facebooth/artwork-11111111-1111-4111-8111-111111111111.png";
const importedObjectKey =
  "booths/booth-2/facebooth/artwork-22222222-2222-4222-8222-222222222222.png";
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

function merchWithArtwork() {
  const document = createDefaultAcrylicStandeeDocument();
  return {
    ...document,
    artwork: {
      objectKey: sourceObjectKey,
      contentType: "image/png" as const,
      pixelWidth: 100,
      pixelHeight: 150,
      contourPoints: null,
      opaqueFallback: true,
    },
  };
}

test("portable Facebooth packages round-trip normalized artwork with integrity", async () => {
  const document = merchWithArtwork();
  const projectPackage = await createFaceboothExportPackage({
    name: "Portable standee",
    kind: "MERCH",
    document,
    assetUrls: { [sourceObjectKey]: "https://assets.example/standee.png" },
    exportedAt: "2026-08-10T00:00:00.000Z",
    fetchAsset: async () => new Response(pngBytes.slice().buffer),
  });
  assert.equal(
    faceboothExportPackageSchema.safeParse(projectPackage).success,
    true,
  );
  assert.equal(projectPackage.assets.length, 1);
  const parsed = await parseFaceboothExportFile(
    new File([JSON.stringify(projectPackage)], "standee.facebooth.json", {
      type: "application/json",
    }),
  );
  assert.deepEqual(parsed.decodedAssets.get(sourceObjectKey), pngBytes);
  const replaced = replaceFaceboothArtworkObjectKeys(
    parsed.package.project.document,
    new Map([[sourceObjectKey, importedObjectKey]]),
  );
  assert.equal(replaced.kind, "MERCH");
  if (replaced.kind === "MERCH") {
    assert.equal(replaced.artwork.objectKey, importedObjectKey);
  }
});

test("portable Facebooth imports reject unsupported versions and asset tampering", async () => {
  const unsupported = new File(
    [
      JSON.stringify({
        format: "CYFURDEN_FACEBOOTH_PROJECT",
        version: 2,
      }),
    ],
    "future.facebooth.json",
  );
  await assert.rejects(
    () => parseFaceboothExportFile(unsupported),
    (error: unknown) =>
      error instanceof FaceboothPortableError &&
      error.code === "UNSUPPORTED_VERSION",
  );

  const projectPackage = await createFaceboothExportPackage({
    name: "Tamper test",
    kind: "MERCH",
    document: merchWithArtwork(),
    assetUrls: { [sourceObjectKey]: "https://assets.example/standee.png" },
    fetchAsset: async () => new Response(pngBytes.slice().buffer),
  });
  projectPackage.assets[0].sha256 = "0".repeat(64);
  await assert.rejects(
    () =>
      parseFaceboothExportFile(
        new File([JSON.stringify(projectPackage)], "tampered.facebooth.json"),
      ),
    (error: unknown) =>
      error instanceof FaceboothPortableError &&
      error.code === "ASSET_MISMATCH",
  );
});

test("PNG presets are bounded and recovery drafts are booth/project scoped", () => {
  assert.deepEqual(resolveFaceboothPngSize("SQUARE", 1.8), {
    width: 2_048,
    height: 2_048,
  });
  assert.deepEqual(resolveFaceboothPngSize("CURRENT", 2), {
    width: 2_048,
    height: 1_024,
  });
  assert.deepEqual(resolveFaceboothPngSize("CURRENT", 0.5), {
    width: 1_024,
    height: 2_048,
  });
  assert.equal(faceboothDraftKey("booth-a", "project-b"), "booth-a:project-b");
});
