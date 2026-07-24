import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultStorefrontDocument,
  readStorefrontDocument,
  resolveStorefrontFeaturedProductIds,
  storefrontCornerRadiusPixels,
  storefrontFeaturedProductLimit,
  storefrontLocaleDisplayCodes,
  storefrontDocumentSchema,
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

test("keeps storefront documents from before slider selection compatible", () => {
  const legacyDocument = Object.fromEntries(
    Object.entries(createDefaultStorefrontDocument("Paper Comet")).filter(
      ([key]) => key !== "featuredProductIds",
    ),
  );

  assert.equal(
    readStorefrontDocument(legacyDocument, "Fallback").featuredProductIds,
    null,
  );
});

test("resolves configured slider products in seller-defined order", () => {
  const document = {
    ...createDefaultStorefrontDocument("Paper Comet"),
    featuredProductIds: ["product-c", "product-a", "missing"],
  };
  const products = [
    { id: "product-a", featured: false },
    { id: "product-b", featured: true },
    { id: "product-c", featured: false },
  ];

  assert.deepEqual(resolveStorefrontFeaturedProductIds(document, products), [
    "product-c",
    "product-a",
  ]);
});

test("falls back to legacy featured flags and enforces unique slider choices", () => {
  const document = createDefaultStorefrontDocument("Paper Comet");
  const products = Array.from(
    { length: storefrontFeaturedProductLimit + 2 },
    (_, index) => ({ id: `product-${index}`, featured: true }),
  );

  assert.equal(
    resolveStorefrontFeaturedProductIds(document, products).length,
    storefrontFeaturedProductLimit,
  );
  assert.equal(
    storefrontDocumentSchema.safeParse({
      ...document,
      featuredProductIds: ["product-a", "product-a"],
    }).success,
    false,
  );
});
