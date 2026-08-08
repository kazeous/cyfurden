import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePreparedImageDimensions,
  imageHasTransparency,
  OPAQUE_WEBP_QUALITY,
  ORDINARY_IMAGE_LONGEST_EDGE,
} from "../lib/image-preparation";

test("ordinary image dimensions retain aspect ratio without upscaling", () => {
  assert.deepEqual(calculatePreparedImageDimensions(800, 600), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(calculatePreparedImageDimensions(5_120, 2_560), {
    width: 2_560,
    height: 1_280,
  });
  assert.deepEqual(calculatePreparedImageDimensions(2_000, 4_000), {
    width: 1_280,
    height: 2_560,
  });
  assert.equal(ORDINARY_IMAGE_LONGEST_EDGE, 2_560);
  assert.equal(OPAQUE_WEBP_QUALITY, 92);
});

test("ordinary image preparation detects any non-opaque pixel", () => {
  assert.equal(
    imageHasTransparency({
      width: 2,
      height: 1,
      data: Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 254]),
    }),
    true,
  );
  assert.equal(
    imageHasTransparency({
      width: 1,
      height: 1,
      data: Uint8ClampedArray.from([0, 0, 0, 255]),
    }),
    false,
  );
});
