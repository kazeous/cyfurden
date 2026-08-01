import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoStorefrontDocument,
  DEMO_BOOTH_PATH,
  DEMO_BOOTH_SLUG,
  isReservedBoothSlug,
} from "../lib/demo-booth";
import { parseBilingual } from "../lib/i18n/parser";
import { storefrontDocumentSchema } from "../lib/storefront-document";

test("the public demo has one reserved, canonical path", () => {
  assert.equal(DEMO_BOOTH_SLUG, "cyfurden-demo");
  assert.equal(DEMO_BOOTH_PATH, "/s/cyfurden-demo");
  assert.equal(isReservedBoothSlug("cyfurden-demo"), true);
  assert.equal(isReservedBoothSlug("  CYFURDEN-DEMO  "), true);
  assert.equal(isReservedBoothSlug("my-cyfurden-demo"), false);
});

test("the demo storefront document is bilingual and schema-valid", () => {
  const productIds = ["field-notes", "familiar-pin", "weather-stickers"];
  const document = createDemoStorefrontDocument(productIds);

  assert.equal(storefrontDocumentSchema.safeParse(document).success, true);
  assert.deepEqual(document.featuredProductIds, productIds);
  assert.equal(parseBilingual(document.name, "en"), "Paper Comet Studio");
  assert.equal(parseBilingual(document.name, "vi"), "Studio Sao Chổi Giấy");
  assert.equal(parseBilingual(document.eventBoothLabel, "en"), "Table D-13");
  assert.equal(parseBilingual(document.eventBoothLabel, "vi"), "Bàn D-13");
  assert.match(parseBilingual(document.announcement, "en"), /testing only/i);
  assert.match(parseBilingual(document.eventFulfillment, "vi"), /không giao/i);
});
