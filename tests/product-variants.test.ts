import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PRODUCT_VARIANTS,
  parseProductVariantManifest,
} from "../lib/product-variants";

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: null,
  sku: "a4 holo",
  label: "[en]A4 hologram[/en][vi]A4 hologram[/vi]",
  priceVnd: "500969",
  status: "AVAILABLE",
  stockQuantity: "12",
  fulfillmentNote: "Pack flat",
  ...overrides,
});

test("variant manifests normalize SKU, money, stock, and sort order", () => {
  const result = parseProductVariantManifest([
    variant(),
    variant({
      sku: " A5 mờ ",
      label: "A5 · Matte",
      priceVnd: "",
      stockQuantity: "",
      fulfillmentNote: "",
      status: "PREORDER",
    }),
  ]);
  if (!result.success) assert.fail(result.error);
  assert.deepEqual(result.data, [
    {
      id: null,
      sku: "A4 HOLO",
      label: "[en]A4 hologram[/en][vi]A4 hologram[/vi]",
      priceCents: BigInt(50_096_900),
      status: "AVAILABLE",
      stockQuantity: 12,
      fulfillmentNote: "Pack flat",
      sortOrder: 0,
    },
    {
      id: null,
      sku: "A5 MỜ",
      label: "A5 · Matte",
      priceCents: null,
      status: "PREORDER",
      stockQuantity: null,
      fulfillmentNote: null,
      sortOrder: 1,
    },
  ]);
});

test("variant manifests reject unsafe counts, duplicate IDs, and duplicate SKUs", () => {
  assert.deepEqual(parseProductVariantManifest([]), {
    success: false,
    error: "count",
  });
  assert.deepEqual(
    parseProductVariantManifest(
      Array.from({ length: MAX_PRODUCT_VARIANTS + 1 }, (_, index) =>
        variant({ sku: `SKU-${index}` }),
      ),
    ),
    { success: false, error: "count" },
  );
  assert.deepEqual(
    parseProductVariantManifest([
      variant({ id: "same", sku: "ONE" }),
      variant({ id: "same", sku: "TWO" }),
    ]),
    { success: false, error: "duplicate-id" },
  );
  assert.deepEqual(
    parseProductVariantManifest([
      variant({ sku: "a4 holo" }),
      variant({ sku: " A4 HOLO " }),
    ]),
    { success: false, error: "duplicate-sku" },
  );
});

test("variant manifests reject malformed labels, prices, stock, and notes", () => {
  for (const [overrides, error] of [
    [{ label: "" }, "label"],
    [{ priceVnd: "1.5" }, "price"],
    [{ stockQuantity: "-1" }, "stock"],
    [{ sku: "BAD/SKU" }, "sku"],
    [{ fulfillmentNote: "x".repeat(501) }, "note"],
  ] as const) {
    assert.deepEqual(parseProductVariantManifest([variant(overrides)]), {
      success: false,
      error,
    });
  }
});
