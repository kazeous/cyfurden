import assert from "node:assert/strict";
import test from "node:test";
import {
  boothSocialLinksSchema,
  compactBoothSocialLinks,
  isBoothLogoObjectKey,
  readBoothSocialLinks,
} from "../lib/shop-settings";

test("social settings accept secure links and discard invalid stored JSON", () => {
  const links = boothSocialLinksSchema.parse({
    instagram: "https://instagram.com/cyfurden",
    facebook: "",
    tiktok: "",
    x: "https://x.com/cyfurden",
    threads: "",
    youtube: "",
  });

  assert.deepEqual(compactBoothSocialLinks(links), {
    instagram: "https://instagram.com/cyfurden",
    x: "https://x.com/cyfurden",
  });
  assert.deepEqual(readBoothSocialLinks(compactBoothSocialLinks(links)), links);
  assert.equal(
    boothSocialLinksSchema.safeParse({
      ...links,
      youtube: "http://example.com",
    }).success,
    false,
  );
  assert.deepEqual(readBoothSocialLinks({ instagram: "javascript:alert(1)" }), {
    instagram: "",
    facebook: "",
    tiktok: "",
    x: "",
    threads: "",
    youtube: "",
  });
});

test("logo object keys stay inside the authorized booth identity prefix", () => {
  assert.equal(
    isBoothLogoObjectKey(
      "booth_123",
      "booths/booth_123/identity/logo-123e4567-e89b-12d3-a456-426614174000.png",
    ),
    true,
  );
  assert.equal(
    isBoothLogoObjectKey(
      "booth_123",
      "booths/another-booth/identity/logo-123e4567-e89b-12d3-a456-426614174000.png",
    ),
    false,
  );
  assert.equal(
    isBoothLogoObjectKey("booth_123", "booths/booth_123/payment/qr.png"),
    false,
  );
});
