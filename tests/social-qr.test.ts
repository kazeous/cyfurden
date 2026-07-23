import assert from "node:assert/strict";
import test from "node:test";
import { createSocialQrDataUrl, socialQrOptions } from "../lib/social-qr";

test("social QR generation uses a quiet zone and high error correction", async () => {
  const first = await createSocialQrDataUrl(
    "https://instagram.com/cyfurden-studio",
  );
  const second = await createSocialQrDataUrl("https://x.com/cyfurden-studio");

  assert.match(first, /^data:image\/png;base64,/);
  assert.match(second, /^data:image\/png;base64,/);
  assert.notEqual(first, second);
  assert.equal(socialQrOptions.errorCorrectionLevel, "H");
  assert.ok(socialQrOptions.margin >= 2);
});
