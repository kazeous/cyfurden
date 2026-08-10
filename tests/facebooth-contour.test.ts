import assert from "node:assert/strict";
import test from "node:test";
import {
  createPresetFaceboothContour,
  traceFaceboothAlphaContour,
} from "../lib/facebooth-contour";
import {
  buildStandeeGeometryModel,
  resizeStandeePreservingAspect,
} from "../lib/facebooth-geometry";
import {
  acrylicStandeeDocumentSchema,
  createDefaultAcrylicStandeeDocument,
  FACEBOOTH_MAX_CONTOUR_POINTS,
} from "../lib/facebooth-documents";

function mask(
  width: number,
  height: number,
  fill: (x: number, y: number) => number,
) {
  return Uint8Array.from({ length: width * height }, (_, index) =>
    fill(index % width, Math.floor(index / width)),
  );
}

test("alpha tracing handles transparent and opaque artwork deterministically", () => {
  const empty = traceFaceboothAlphaContour({
    width: 4,
    height: 4,
    alpha: mask(4, 4, () => 0),
  });
  assert.equal(empty.source, "PRESET");
  assert.deepEqual(empty.points, createPresetFaceboothContour());
  const opaque = traceFaceboothAlphaContour({
    width: 4,
    height: 6,
    alpha: mask(4, 6, () => 255),
  });
  assert.equal(opaque.source, "PRESET");
  assert.equal(opaque.opaqueFallback, true);
  assert.ok(opaque.points.length >= 4);
  assert.ok(
    opaque.points.every(
      ({ xMillionths, yMillionths }) =>
        xMillionths >= 0 &&
        xMillionths <= 1_000_000 &&
        yMillionths >= 0 &&
        yMillionths <= 1_000_000,
    ),
  );
});

test("alpha tracing keeps the largest island and optionally fills enclosed gaps", () => {
  const alpha = mask(12, 10, (x, y) => {
    const large = x >= 1 && x <= 7 && y >= 1 && y <= 8 && !(x === 4 && y === 4);
    const small = x >= 10 && y >= 7;
    return large || small ? 255 : 0;
  });
  const filled = traceFaceboothAlphaContour({ width: 12, height: 10, alpha });
  const unfilled = traceFaceboothAlphaContour({
    width: 12,
    height: 10,
    alpha,
    fillGaps: false,
  });
  assert.equal(filled.source, "ALPHA");
  assert.equal(unfilled.source, "ALPHA");
  assert.ok(
    Math.max(...filled.points.map((point) => point.xMillionths)) < 800_000,
  );
});

test("noisy and oversized contours stay within the persisted point budget", () => {
  const width = 400;
  const height = 180;
  const result = traceFaceboothAlphaContour({
    width,
    height,
    alpha: mask(width, height, (x, y) =>
      x > 5 && x < width - 5 && y > 5 + (x % 9) && y < height - 6 ? 255 : 0,
    ),
  });
  assert.equal(result.source, "ALPHA");
  assert.ok(result.points.length <= FACEBOOTH_MAX_CONTOUR_POINTS);
  assert.equal(
    new Set(
      result.points.map((point) => `${point.xMillionths}:${point.yMillionths}`),
    ).size,
    result.points.length,
  );
});

test("standee geometry round-trips integer millimetres without aspect drift", () => {
  const initial = createDefaultAcrylicStandeeDocument();
  const withArtwork = acrylicStandeeDocumentSchema.parse({
    ...initial,
    artwork: {
      objectKey:
        "booths/booth-1/facebooth/artwork-00000000-0000-4000-8000-000000000000.png",
      contentType: "image/png",
      pixelWidth: 800,
      pixelHeight: 1_200,
      contourPoints: createPresetFaceboothContour(),
      opaqueFallback: false,
    },
  });
  const resized = resizeStandeePreservingAspect(withArtwork, "height", 375);
  const parsed = acrylicStandeeDocumentSchema.parse(
    JSON.parse(JSON.stringify(resized)),
  );
  assert.deepEqual(parsed.sizeMm, { width: 250, height: 375, thickness: 3 });
  assert.deepEqual(
    buildStandeeGeometryModel(parsed),
    buildStandeeGeometryModel(resized),
  );
});
