import assert from "node:assert/strict";
import test from "node:test";
import {
  storefrontCornerRadiusPixels,
  storefrontLocaleDisplayCodes,
} from "../lib/storefront-document";

test("exposes storefront corner presets as pixel values", () => {
  assert.deepEqual(storefrontCornerRadiusPixels, {
    soft: 10,
    round: 16,
    pill: 24,
  });
});

test("uses the requested locale display codes", () => {
  assert.equal(storefrontLocaleDisplayCodes.en, "EN");
  assert.equal(storefrontLocaleDisplayCodes.vi, "VN");
});
